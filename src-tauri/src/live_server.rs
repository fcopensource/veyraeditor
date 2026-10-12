//! Live Server: serves a folder over http://127.0.0.1 and reloads the browser when files change.
//! The same behaviour as the Veyra Live Server extension for VS Code (extensions/live-server), and the
//! same browser script: HTML and JavaScript changes reload the page, CSS changes are swapped in place.
//! Only std and notify, so the server can be tested without the rest of the app.
use notify::event::ModifyKind;
use notify::{EventKind, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};

/// The browser half, shared with the VS Code extension.
pub const CLIENT_SCRIPT: &str = include_str!("../../extensions/live-server/media/live-reload.js");
const CLIENT_PATH: &str = "/__veyra_live/client.js";
const EVENTS_PATH: &str = "/__veyra_live/events";
const SCRIPT_TAG: &[u8] = b"<script src=\"/__veyra_live/client.js\"></script>";
/// Same default as Live Server for VS Code, so bookmarks keep working.
pub const DEFAULT_PORT: u16 = 5500;

type Clients = Arc<Mutex<Vec<TcpStream>>>;

pub struct LiveServer {
    pub port: u16,
    pub root: PathBuf,
    stop: Arc<AtomicBool>,
    clients: Clients,
    _watcher: notify::RecommendedWatcher,
}

impl LiveServer {
    /// Serve `root` on 127.0.0.1, on `port` or the next free port after it.
    pub fn start(root: &Path, port: u16) -> Result<LiveServer, String> {
        let root = root.canonicalize().map_err(|e| format!("Can't serve {}: {e}", root.display()))?;
        if !root.is_dir() { return Err(format!("{} is not a folder", root.display())); }
        let listener = (port..port.saturating_add(20)).find_map(|p| TcpListener::bind(("127.0.0.1", p)).ok())
            .map_or_else(|| TcpListener::bind(("127.0.0.1", 0)), Ok).map_err(|e| format!("No free port for Live Server: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let clients: Clients = Arc::default();

        let (tx, rx) = channel();
        let mut watcher = notify::recommended_watcher(move |event| { let _ = tx.send(event); }).map_err(|e| format!("Can't watch files: {e}"))?;
        watcher.watch(&root, RecursiveMode::Recursive).map_err(|e| format!("Can't watch {}: {e}", root.display()))?;
        {
            let (clients, stop) = (clients.clone(), stop.clone());
            let (mut seen, started) = (HashMap::<PathBuf, SystemTime>::new(), SystemTime::now());
            thread::spawn(move || loop {
                match rx.recv_timeout(Duration::from_secs(15)) {
                    Ok(first) => {
                        // Editors save in bursts (temp file, rename, metadata): wait for quiet, then send one event.
                        let mut changed: Vec<PathBuf> = Vec::new();
                        let mut take = |event: notify::Result<notify::Event>| if let Ok(event) = event {
                            changed.extend(event.paths.into_iter().filter(|p| !ignored(p) && really_changed(&event.kind, p, &mut seen, started)));
                        };
                        take(first);
                        while let Ok(event) = rx.recv_timeout(Duration::from_millis(120)) { take(event); }
                        if stop.load(Ordering::SeqCst) { break; }
                        if let Some(kind) = change_kind(&changed) { broadcast(&clients, &format!("event: {kind}\ndata: {}\n\n", changed.len())); }
                    }
                    // Comments keep proxies and browsers from closing idle connections, and prune closed tabs.
                    Err(RecvTimeoutError::Timeout) => if stop.load(Ordering::SeqCst) { break } else { broadcast(&clients, ":\n\n") },
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            });
        }
        {
            let (root, clients, stop) = (root.clone(), clients.clone(), stop.clone());
            thread::spawn(move || for stream in listener.incoming() {
                if stop.load(Ordering::SeqCst) { break; }
                let Ok(stream) = stream else { continue };
                let (root, clients) = (root.clone(), clients.clone());
                thread::spawn(move || { let _ = handle(stream, &root, &clients); });
            });
        }
        Ok(LiveServer { port, root, stop, clients, _watcher: watcher })
    }

    pub fn url(&self) -> String { format!("http://127.0.0.1:{}/", self.port) }
}

impl Drop for LiveServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", self.port)); // wakes the accept loop so it can exit
        if let Ok(mut clients) = self.clients.lock() { for client in clients.drain(..) { let _ = client.shutdown(Shutdown::Both); } }
    }
}

fn ignored(path: &Path) -> bool {
    path.components().any(|c| matches!(c.as_os_str().to_str(), Some(".git" | "node_modules" | ".DS_Store")))
}

/// Whether an event is a real change. Windows reports files and folders as "modified" when they are
/// only read (their last-access time changes), which would reload the page in a loop: a modification
/// counts only when the file's modified time changed. Folders count only when created, removed or renamed.
fn really_changed(kind: &EventKind, path: &Path, seen: &mut HashMap<PathBuf, SystemTime>, started: SystemTime) -> bool {
    match kind {
        EventKind::Access(_) => false,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_)) => { seen.remove(path); true }
        _ => {
            let Ok(meta) = std::fs::metadata(path) else { return true }; // gone: a deletion
            if meta.is_dir() { return false; }
            let Ok(modified) = meta.modified() else { return true };
            let before = seen.insert(path.to_path_buf(), modified);
            match before {
                Some(before) => before != modified,
                // First event for this file: a write since the server started, not a read of an existing file.
                None => modified >= started,
            }
        }
    }
}

/// "css" when only stylesheets changed (swapped in place), otherwise "reload".
fn change_kind(paths: &[PathBuf]) -> Option<&'static str> {
    if paths.is_empty() { return None; }
    let css = paths.iter().all(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("css")));
    Some(if css { "css" } else { "reload" })
}

fn broadcast(clients: &Clients, message: &str) {
    if let Ok(mut clients) = clients.lock() { clients.retain_mut(|client| client.write_all(message.as_bytes()).and_then(|_| client.flush()).is_ok()); }
}

/// The file a URL path refers to, inside `root`. None for anything that escapes it.
pub fn resolve(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = percent_decode(url_path.split(['?', '#']).next().unwrap_or(""));
    let mut path = root.to_path_buf();
    for segment in decoded.split('/') {
        if segment.is_empty() || segment == "." { continue; }
        if segment == ".." || segment.contains(['\\', ':', '\0']) { return None; }
        path.push(segment);
    }
    // Symbolic links may point anywhere: the real location must still be inside the folder.
    let real = path.canonicalize().ok()?;
    real.starts_with(root).then_some(real)
}

fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
            if let Some(byte) = hex { out.push(byte); i += 3; continue; }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Adds the live reload script before the last </body>, or at the end when there is none.
pub fn inject(html: &[u8]) -> Vec<u8> {
    let lower = html.to_ascii_lowercase();
    let at = lower.windows(7).rposition(|w| w == b"</body>").unwrap_or(html.len());
    [&html[..at], SCRIPT_TAG, &html[at..]].concat()
}

pub fn mime(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" | "cjs" => "text/javascript; charset=utf-8",
        "json" | "map" | "webmanifest" => "application/json; charset=utf-8",
        "txt" | "md" | "csv" => "text/plain; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "avif" => "image/avif", "ico" => "image/x-icon", "bmp" => "image/bmp",
        "woff" => "font/woff", "woff2" => "font/woff2", "ttf" => "font/ttf", "otf" => "font/otf",
        "mp4" => "video/mp4", "webm" => "video/webm", "mp3" => "audio/mpeg", "wav" => "audio/wav", "ogg" => "audio/ogg",
        "wasm" => "application/wasm", "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn is_html(path: &Path) -> bool { path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm")) }

fn escape(text: &str) -> String { text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }

fn respond(stream: &mut TcpStream, status: &str, headers: &[(&str, String)], body: &[u8], head_only: bool) -> std::io::Result<()> {
    let mut out = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n", body.len());
    for (name, value) in headers { out.push_str(&format!("{name}: {value}\r\n")); }
    out.push_str("\r\n");
    stream.write_all(out.as_bytes())?;
    if !head_only { stream.write_all(body)?; }
    stream.flush()
}

fn page(title: &str, body: &str) -> Vec<u8> {
    inject(format!("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title>\
        <style>body{{font:15px system-ui,sans-serif;margin:32px;color:#1f2933}}a{{color:#0b6bcb;text-decoration:none}}a:hover{{text-decoration:underline}}li{{margin:6px 0;list-style:none}}small{{color:#6b7785}}</style>\
        </head><body>{body}</body></html>").as_bytes())
}

fn handle(mut stream: TcpStream, root: &Path, clients: &Clients) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    let mut request = Vec::new();
    let mut buffer = [0u8; 4096];
    while !request.windows(4).any(|w| w == b"\r\n\r\n") {
        let read = stream.read(&mut buffer)?;
        if read == 0 || request.len() > 64 * 1024 { return Ok(()); }
        request.extend_from_slice(&buffer[..read]);
    }
    let line = String::from_utf8_lossy(&request[..request.iter().position(|&b| b == b'\r').unwrap_or(0)]).into_owned();
    let mut parts = line.split(' ');
    let (method, target) = (parts.next().unwrap_or(""), parts.next().unwrap_or("/"));
    let head_only = method == "HEAD";
    let head_text = String::from_utf8_lossy(&request).into_owned();
    let range = head_text.lines().find_map(|line| line.split_once(':').filter(|(name, _)| name.trim().eq_ignore_ascii_case("range")).map(|(_, value)| value.trim().to_string()));
    if method != "GET" && !head_only { return respond(&mut stream, "405 Method Not Allowed", &[("Allow", "GET, HEAD".into())], b"", false); }
    let url_path = target.split(['?', '#']).next().unwrap_or("/");

    if url_path == CLIENT_PATH { return respond(&mut stream, "200 OK", &[("Content-Type", "text/javascript; charset=utf-8".into())], CLIENT_SCRIPT.as_bytes(), head_only); }
    if url_path == EVENTS_PATH {
        stream.set_read_timeout(None)?;
        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\nretry: 1000\n\n")?;
        stream.flush()?;
        if let Ok(mut clients) = clients.lock() { clients.push(stream); }
        return Ok(());
    }

    let Some(path) = resolve(root, url_path) else {
        return respond(&mut stream, "404 Not Found", &[("Content-Type", "text/html; charset=utf-8".into())], &page("Not found", &format!("<h1>404</h1><p>{} was not found.</p>", escape(&percent_decode(url_path)))), head_only);
    };
    if path.is_dir() {
        if !url_path.ends_with('/') { return respond(&mut stream, "301 Moved Permanently", &[("Location", format!("{url_path}/"))], b"", head_only); }
        let index = ["index.html", "index.htm"].iter().map(|name| path.join(name)).find(|p| p.is_file());
        if let Some(index) = index { return send_file(&mut stream, &index, head_only, None); }
        let mut entries: Vec<(bool, String)> = std::fs::read_dir(&path)?.flatten()
            .filter_map(|e| { let name = e.file_name().to_string_lossy().into_owned(); (!name.starts_with('.')).then(|| (e.path().is_dir(), name)) }).collect();
        entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase())));
        let shown = percent_decode(url_path);
        let mut list = if url_path == "/" { String::new() } else { "<li><a href=\"../\">../</a></li>".into() };
        for (dir, name) in entries {
            let href = name.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect::<String>();
            list.push_str(&format!("<li><a href=\"{href}{slash}\">{name}{slash}</a></li>", name = escape(&name), slash = if dir { "/" } else { "" }));
        }
        let body = page(&format!("Index of {}", escape(&shown)), &format!("<h1>Index of {}</h1><ul>{list}</ul><small>Veyra Live Server</small>", escape(&shown)));
        return respond(&mut stream, "200 OK", &[("Content-Type", "text/html; charset=utf-8".into())], &body, head_only);
    }
    send_file(&mut stream, &path, head_only, range.as_deref())
}

/// A single byte range from a Range header ("bytes=0-99", "bytes=100-", "bytes=-50"), so audio and video can seek.
/// None: no range, or several ranges (the whole file is sent). Some(None): the range is outside the file.
pub fn parse_range(header: Option<&str>, size: u64) -> Option<Option<(u64, u64)>> {
    let spec = header?.trim().strip_prefix("bytes=")?;
    let (first, last) = spec.split_once('-')?;
    if spec.contains(',') || (first.is_empty() && last.is_empty()) { return None; }
    let number = |text: &str| text.parse::<u64>().ok();
    let (start, end) = if first.is_empty() {
        let suffix = number(last)?;
        if suffix == 0 { return Some(None); }
        (size.saturating_sub(suffix), size.saturating_sub(1))
    } else {
        let start = number(first)?;
        (start, if last.is_empty() { size.saturating_sub(1) } else { number(last)?.min(size.saturating_sub(1)) })
    };
    Some(if size == 0 || start > end || start >= size { None } else { Some((start, end)) })
}

/// HTML gets the live reload script; everything else streams from disk (large videos never sit in memory),
/// honouring Range requests.
fn send_file(stream: &mut TcpStream, path: &Path, head_only: bool, range: Option<&str>) -> std::io::Result<()> {
    if is_html(path) { return respond(stream, "200 OK", &[("Content-Type", mime(path).into())], &inject(&std::fs::read(path)?), head_only); }
    let mut file = std::fs::File::open(path)?;
    let size = file.metadata()?.len();
    let (status, start, end) = match parse_range(range, size) {
        Some(None) => return respond(stream, "416 Range Not Satisfiable", &[("Content-Range", format!("bytes */{size}"))], b"", head_only),
        Some(Some((start, end))) => ("206 Partial Content", start, end),
        None => ("200 OK", 0, size.saturating_sub(1)),
    };
    let length = if size == 0 { 0 } else { end - start + 1 };
    let mut head = format!("HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n", mime(path));
    if status.starts_with("206") { head.push_str(&format!("Content-Range: bytes {start}-{end}/{size}\r\n")); }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;
    if !head_only && length > 0 {
        file.seek(SeekFrom::Start(start))?;
        std::io::copy(&mut file.take(length), stream)?;
    }
    stream.flush()
}

/// Normal components only: used to turn a workspace-relative file into a URL path.
pub fn url_for(relative: &str) -> String {
    let path = Path::new(relative);
    let parts: Vec<String> = path.components().filter_map(|c| match c { Component::Normal(s) => Some(s.to_string_lossy().into_owned()), _ => None }).collect();
    let encoded: Vec<String> = parts.iter().map(|p| p.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-._~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()).collect();
    format!("/{}", encoded.join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    use std::time::Instant;

    fn get(port: u16, path: &str) -> (String, Vec<u8>) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes()).unwrap();
        let mut response = Vec::new();
        stream.read_to_end(&mut response).unwrap();
        let split = response.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        (String::from_utf8_lossy(&response[..split]).into_owned(), response[split + 4..].to_vec())
    }

    /// Opens the event stream and returns the next "event:" name.
    fn next_event(reader: &mut BufReader<TcpStream>, timeout: Duration) -> Option<String> {
        let started = Instant::now();
        let mut line = String::new();
        while started.elapsed() < timeout {
            line.clear();
            if reader.read_line(&mut line).ok()? == 0 { return None; }
            if let Some(name) = line.strip_prefix("event: ") { return Some(name.trim().to_string()); }
        }
        None
    }

    #[test] fn script_goes_before_the_last_body_tag() {
        assert_eq!(inject(b"<html><BODY>hi</BODY></html>"), [&b"<html><BODY>hi"[..], SCRIPT_TAG, b"</BODY></html>"].concat());
        assert_eq!(inject(b"<p>no body"), [&b"<p>no body"[..], SCRIPT_TAG].concat());
    }

    #[test] fn paths_never_leave_the_folder() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir(root.join("site")).unwrap();
        std::fs::write(root.join("site").join("a b.html"), "x").unwrap();
        std::fs::write(root.join("secret.txt"), "x").unwrap();
        let site = root.join("site").canonicalize().unwrap();
        assert_eq!(resolve(&site, "/a%20b.html?v=1"), Some(site.join("a b.html")));
        assert_eq!(resolve(&site, "/"), Some(site.clone()));
        for bad in ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/..\\secret.txt", "/C:/Windows/win.ini", "/missing.html"] { assert_eq!(resolve(&site, bad), None, "{bad}"); }
    }

    #[test] fn byte_ranges_let_media_seek() {
        assert_eq!(parse_range(Some("bytes=0-99"), 1000), Some(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=900-"), 1000), Some(Some((900, 999))));
        assert_eq!(parse_range(Some("bytes=-100"), 1000), Some(Some((900, 999))));
        assert_eq!(parse_range(Some("bytes=500-5000"), 1000), Some(Some((500, 999))));
        assert_eq!(parse_range(Some("bytes=1000-"), 1000), Some(None));
        assert_eq!(parse_range(None, 1000), None);
        assert_eq!(parse_range(Some("bytes=0-1,5-9"), 1000), None, "several ranges: send the whole file");
    }

    #[test] fn streams_files_with_ranges() {
        let dir = tempfile::tempdir().unwrap();
        let mut media = vec![7u8; 3 * 1024 * 1024];
        media[..5].copy_from_slice(b"VEYRA");
        std::fs::write(dir.path().join("clip.mp4"), &media).unwrap();
        let server = LiveServer::start(dir.path(), 0).unwrap();
        let request = |extra: &str| {
            let mut stream = TcpStream::connect(("127.0.0.1", server.port)).unwrap();
            stream.write_all(format!("GET /clip.mp4 HTTP/1.1\r\nHost: localhost\r\n{extra}\r\n").as_bytes()).unwrap();
            let mut response = Vec::new();
            stream.read_to_end(&mut response).unwrap();
            let split = response.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
            (String::from_utf8_lossy(&response[..split]).into_owned(), response[split + 4..].to_vec())
        };
        let (head, body) = request("");
        assert!(head.starts_with("HTTP/1.1 200") && head.contains("Accept-Ranges: bytes"), "{head}");
        assert_eq!(body.len(), media.len());
        let (head, body) = request("Range: bytes=0-4\r\n");
        assert!(head.starts_with("HTTP/1.1 206") && head.contains(&format!("Content-Range: bytes 0-4/{}", media.len())), "{head}");
        assert_eq!(body, b"VEYRA");
        assert!(request(&format!("range: bytes={}-\r\n", media.len())).0.starts_with("HTTP/1.1 416"));
    }

    #[test] fn content_types_and_urls() {
        assert_eq!(mime(Path::new("a/index.HTML")), "text/html; charset=utf-8");
        assert_eq!(mime(Path::new("logo.svg")), "image/svg+xml");
        assert_eq!(mime(Path::new("app.mjs")), "text/javascript; charset=utf-8");
        assert_eq!(url_for("pages/about me.html"), "/pages/about%20me.html");
        assert_eq!(change_kind(&[PathBuf::from("a.css"), PathBuf::from("b.CSS")]), Some("css"));
        assert_eq!(change_kind(&[PathBuf::from("a.css"), PathBuf::from("index.html")]), Some("reload"));
        assert_eq!(change_kind(&[]), None);
        assert!(ignored(Path::new("/p/node_modules/x/y.js")) && ignored(Path::new("/p/.git/index")) && !ignored(Path::new("/p/src/app.js")));
    }

    #[test] fn serves_pages_and_reloads_on_change() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<html><body><h1>Hello</h1></body></html>").unwrap();
        std::fs::write(dir.path().join("style.css"), "h1{color:red}").unwrap();
        std::fs::create_dir(dir.path().join("docs")).unwrap();
        std::fs::write(dir.path().join("docs").join("notes.txt"), "n").unwrap();
        let server = LiveServer::start(dir.path(), 0).unwrap();
        let port = server.port;

        let (head, body) = get(port, "/");
        assert!(head.starts_with("HTTP/1.1 200"), "{head}");
        let body = String::from_utf8(body).unwrap();
        assert!(body.contains("<h1>Hello</h1><script src=\"/__veyra_live/client.js\"></script></body>"), "{body}");
        let (head, body) = get(port, "/style.css");
        assert!(head.contains("text/css") && body == b"h1{color:red}");
        let (head, body) = get(port, CLIENT_PATH);
        assert!(head.contains("text/javascript") && String::from_utf8(body).unwrap().contains("EventSource"));
        assert!(get(port, "/docs").0.starts_with("HTTP/1.1 301"));
        assert!(String::from_utf8(get(port, "/docs/").1).unwrap().contains("notes.txt"));
        assert!(get(port, "/../index.html").0.starts_with("HTTP/1.1 404"));
        assert!(get(port, "/nope.html").0.starts_with("HTTP/1.1 404"));

        let mut events = TcpStream::connect(("127.0.0.1", port)).unwrap();
        events.write_all(format!("GET {EVENTS_PATH} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes()).unwrap();
        events.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
        let mut reader = BufReader::new(events);
        let mut status = String::new();
        reader.read_line(&mut status).unwrap();
        assert!(status.starts_with("HTTP/1.1 200"), "{status}");
        thread::sleep(Duration::from_millis(300)); // let the watcher settle before changing files

        // Browsers reading files must not count as changes (Windows reports reads as modifications).
        for _ in 0..3 { get(port, "/"); get(port, "/style.css"); get(port, "/docs/"); }
        std::fs::write(dir.path().join("style.css"), "h1{color:blue}").unwrap();
        assert_eq!(next_event(&mut reader, Duration::from_secs(10)).as_deref(), Some("css"));
        // The browser fetching the new stylesheet must not trigger another event (no reload loops).
        for _ in 0..3 { get(port, "/style.css"); }
        thread::sleep(Duration::from_millis(400));
        std::fs::write(dir.path().join("index.html"), "<html><body><h1>Changed</h1></body></html>").unwrap();
        assert_eq!(next_event(&mut reader, Duration::from_secs(10)).as_deref(), Some("reload"));

        drop(server);
        thread::sleep(Duration::from_millis(200));
        assert!(TcpStream::connect(("127.0.0.1", port)).is_err(), "the server stops when dropped");
    }
}
