use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::{fs, io::{Read, Write}, path::{Component, Path, PathBuf}, process::Command, sync::{Mutex, atomic::{AtomicBool, Ordering}}};
use tauri::{Emitter, Manager, State, ipc::Channel};
use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
use tauri_plugin_dialog::DialogExt;
mod ai;

const MAX_FILE: u64 = 5 * 1024 * 1024;
#[derive(Default)]
struct Workspace { root: Mutex<Option<PathBuf>>, dirty: AtomicBool, terminal: Mutex<Option<TerminalSession>> }
struct TerminalSession { master: Box<dyn portable_pty::MasterPty + Send>, writer: Box<dyn Write + Send>, child: Box<dyn portable_pty::Child + Send + Sync> }
impl Drop for TerminalSession { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
#[derive(Serialize)]
struct Entry { path: String, name: String, directory: bool }
#[derive(Serialize)]
struct Match { path: String, line: usize, text: String }
#[derive(Serialize)]
struct ContextFile { path: String, content: String, score: usize }
#[derive(Serialize, Default)]
struct GithubInfo { available: bool, authenticated: bool, login: String, name: String, avatar: String, repository: String, url: String, visibility: String, default_branch: String }
type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn menu_item(app:&tauri::App, id:&str, text:&str, accelerator:&str)->tauri::Result<MenuItem<tauri::Wry>>{MenuItem::with_id(app,id,text,true,Some(accelerator))}
fn application_menu(app:&tauri::App)->tauri::Result<tauri::menu::Menu<tauri::Wry>>{
    let application=SubmenuBuilder::new(app,"Veyra Studio").about(None).separator().services().separator().hide().hide_others().show_all().separator().quit().build()?;
    let file=SubmenuBuilder::new(app,"File").items(&[
        &menu_item(app,"file.new","New File…","CmdOrCtrl+N")?,&menu_item(app,"file.open","Open Folder…","CmdOrCtrl+O")?,
        &menu_item(app,"file.save","Save","CmdOrCtrl+S")?,&menu_item(app,"file.saveAll","Save All","CmdOrCtrl+Shift+S")?,
        &menu_item(app,"file.closeEditor","Close Editor","CmdOrCtrl+W")?,&menu_item(app,"file.closeFolder","Close Folder","CmdOrCtrl+K")?
    ]).build()?;
    let edit=SubmenuBuilder::new(app,"Edit").undo().redo().separator().cut().copy().paste().separator().items(&[
        &menu_item(app,"edit.find","Find","CmdOrCtrl+F")?,&menu_item(app,"edit.replace","Replace","CmdOrCtrl+Alt+F")?,
        &menu_item(app,"edit.findFiles","Find in Files","CmdOrCtrl+Shift+F")?,&menu_item(app,"edit.toggleLineComment","Toggle Line Comment","CmdOrCtrl+/")?,
        &menu_item(app,"edit.toggleBlockComment","Toggle Block Comment","CmdOrCtrl+Alt+A")?
    ]).select_all().build()?;
    let selection=SubmenuBuilder::new(app,"Selection").items(&[
        &menu_item(app,"selection.expand","Expand Selection","Ctrl+Shift+Right")?,&menu_item(app,"selection.shrink","Shrink Selection","Ctrl+Shift+Left")?,
        &menu_item(app,"selection.copyUp","Copy Line Up","Alt+Shift+Up")?,&menu_item(app,"selection.copyDown","Copy Line Down","Alt+Shift+Down")?,
        &menu_item(app,"selection.moveUp","Move Line Up","Alt+Up")?,&menu_item(app,"selection.moveDown","Move Line Down","Alt+Down")?,
        &menu_item(app,"selection.cursorAbove","Add Cursor Above","Alt+CmdOrCtrl+Up")?,&menu_item(app,"selection.cursorBelow","Add Cursor Below","Alt+CmdOrCtrl+Down")?,
        &menu_item(app,"selection.nextMatch","Add Next Occurrence","CmdOrCtrl+D")?,&menu_item(app,"selection.allMatches","Select All Occurrences","CmdOrCtrl+Shift+L")?
    ]).build()?;
    let view=SubmenuBuilder::new(app,"View").items(&[
        &menu_item(app,"view.palette","Command Palette…","CmdOrCtrl+Shift+P")?,&menu_item(app,"view.explorer","Explorer","CmdOrCtrl+Shift+E")?,
        &menu_item(app,"view.search","Search","CmdOrCtrl+Shift+F")?,&menu_item(app,"view.git","Source Control","Ctrl+Shift+G")?,
        &menu_item(app,"view.extensions","Extensions","CmdOrCtrl+Shift+X")?,&menu_item(app,"view.problems","Problems","CmdOrCtrl+Shift+M")?,
        &menu_item(app,"view.terminal","Terminal","Ctrl+`")?,&menu_item(app,"view.wordWrap","Word Wrap","Alt+Z")?,&menu_item(app,"view.split","Split Editor","CmdOrCtrl+\\")?
    ]).build()?;
    let go=SubmenuBuilder::new(app,"Go").items(&[
        &menu_item(app,"go.file","Go to File…","CmdOrCtrl+P")?,&menu_item(app,"go.symbol","Go to Symbol in Editor…","CmdOrCtrl+Shift+O")?,
        &menu_item(app,"go.definition","Go to Definition","F12")?,&menu_item(app,"go.references","Go to References","Shift+F12")?,
        &menu_item(app,"go.line","Go to Line/Column…","Ctrl+G")?,&menu_item(app,"go.nextProblem","Next Problem","F8")?,&menu_item(app,"go.previousProblem","Previous Problem","Shift+F8")?
    ]).build()?;
    let run=SubmenuBuilder::new(app,"Run").items(&[&menu_item(app,"run.active","Run Active File","Ctrl+Alt+N")?,&menu_item(app,"run.debug","Start Debugging","F5")?,&menu_item(app,"run.breakpoint","Toggle Breakpoint","F9")?]).build()?;
    let terminal=SubmenuBuilder::new(app,"Terminal").items(&[&menu_item(app,"terminal.new","New Terminal","Ctrl+Shift+`")?,&menu_item(app,"terminal.runActive","Run Active File","Ctrl+Alt+N")?,&menu_item(app,"terminal.clear","Clear Terminal","CmdOrCtrl+K")?]).build()?;
    let help=SubmenuBuilder::new(app,"Help").items(&[&menu_item(app,"help.commands","Show All Commands","CmdOrCtrl+Shift+P")?,&menu_item(app,"help.shortcuts","Keyboard Shortcuts Reference","CmdOrCtrl+K")?,&menu_item(app,"help.about","About Veyra","")?]).build()?;
    MenuBuilder::new(app).items(&[&application,&file,&edit,&selection,&view,&go,&run,&terminal,&help]).build()
}
fn root(state: &Workspace) -> Result<PathBuf> { state.root.lock().map_err(err)?.clone().ok_or("Open a folder first".into()) }
fn checked(root: &Path, relative: &str) -> Result<PathBuf> {
    let rel = Path::new(relative);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Invalid workspace path".into()); }
    let path = root.join(rel);
    let canonical = path.canonicalize().map_err(err)?;
    if !canonical.starts_with(root) { return Err("Symbolic link points outside this workspace".into()); }
    Ok(canonical)
}
fn destination(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative.is_empty() || Path::new(relative).components().any(|c| !matches!(c, Component::Normal(_))) { return Err("Enter a relative path without ..".into()); }
    let path = root.join(relative);
    let parent = path.parent().ok_or("Invalid parent")?.canonicalize().map_err(err)?;
    if !parent.starts_with(root) { return Err("Destination is outside this workspace".into()); }
    if path.exists() || path.symlink_metadata().is_ok() { return Err("A file with that name already exists".into()); }
    Ok(path)
}
fn create_checked(root: &Path, relative: &str, directory: bool) -> Result<()> {
    // Validate the entire input before creating any parents. Path::components
    // normalizes away repeated separators and interior dots, so inspect names too.
    let names: Vec<_> = relative.split('/').collect();
    if relative.contains(['\\', '\0'])
        || names.iter().any(|name| name.trim().is_empty() || *name == "." || *name == "..")
        || Path::new(relative).components().any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Enter a relative path such as src/components/Button.tsx, without empty names, . or ..".into());
    }
    if root.canonicalize().map_err(err)? != root || !fs::symlink_metadata(root).map_err(err)?.is_dir() {
        return Err("The workspace location changed. Open the folder again.".into());
    }

    let mut path = root.to_path_buf();
    // Preflight every existing component before making any filesystem changes.
    for (index, name) in names.iter().enumerate() {
        path.push(name);
        match fs::symlink_metadata(&path) {
            Ok(metadata) => {
                if metadata.file_type().is_symlink() { return Err("Cannot create entries through a symbolic link".into()); }
                if index == names.len() - 1 { return Err("A file or folder with that name already exists".into()); }
                if !metadata.is_dir() { return Err(format!("{} is a file, not a folder", name)); }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(err(error)),
        }
    }

    let mut created_parents = Vec::new();
    let result = (|| {
        let mut path = root.to_path_buf();
        for name in &names[..names.len() - 1] {
            path.push(name);
            match fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
                Ok(_) => return Err("A parent is no longer a regular folder. Refresh and try again.".into()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    fs::create_dir(&path).map_err(err)?;
                    created_parents.push(path.clone());
                }
                Err(error) => return Err(err(error)),
            }
        }
        path.push(names[names.len() - 1]);
        // Both operations fail if the leaf already exists; never truncate it.
        if directory { fs::create_dir(path).map_err(err) }
        else { fs::OpenOptions::new().write(true).create_new(true).open(path).map(|_| ()).map_err(err) }
    })();
    if result.is_err() {
        // Remove only empty folders created by this attempt, leaving all existing
        // entries (and any files subsequently added by another process) alone.
        for parent in created_parents.iter().rev() { let _ = fs::remove_dir(parent); }
    }
    result
}
fn copy_directory(source:&Path,target:&Path)->Result<()> {
    fs::create_dir(target).map_err(err)?;
    for item in fs::read_dir(source).map_err(err)? {
        let item=item.map_err(err)?;let kind=item.file_type().map_err(err)?;
        if kind.is_symlink(){return Err("Folders containing symbolic links cannot be copied".into());}
        let next=target.join(item.file_name());
        if kind.is_dir(){copy_directory(&item.path(),&next)?;}else if kind.is_file(){fs::copy(item.path(),next).map_err(err)?;}
    }
    Ok(())
}
fn copy_checked(root:&Path,path:&str,next:&str)->Result<()> {
    let source=checked(root,path)?;let target=destination(root,next)?;
    if source.is_dir()&&target.starts_with(&source){return Err("A folder cannot be copied inside itself".into());}
    let result=if source.is_dir(){copy_directory(&source,&target)}else if source.is_file(){fs::copy(&source,&target).map(|_|()).map_err(err)}else{Err("Only files and folders can be copied".into())};
    if result.is_err()&&target.exists(){if target.is_dir(){let _=fs::remove_dir_all(&target);}else{let _=fs::remove_file(&target);}}
    result
}
fn duplicate_name(root:&Path,path:&str)->Result<String>{
    let source=checked(root,path)?;let relative=Path::new(path);let parent=relative.parent().unwrap_or(Path::new(""));
    let name=relative.file_name().and_then(|value|value.to_str()).ok_or("Invalid name")?;
    let (stem,extension)=if source.is_file(){let parsed=Path::new(name);(parsed.file_stem().and_then(|value|value.to_str()).unwrap_or(name),parsed.extension().and_then(|value|value.to_str()))}else{(name,None)};
    for number in 1..1000 {
        let suffix=if number==1{" copy".to_string()}else{format!(" copy {number}")};
        let file_name=match extension{Some(ext)=>format!("{stem}{suffix}.{ext}"),None=>format!("{stem}{suffix}")};
        let candidate=parent.join(file_name).to_string_lossy().into_owned();
        if !root.join(&candidate).exists(){return Ok(candidate);}
    }
    Err("Could not choose a duplicate name".into())
}
fn text_file(path: &Path) -> Result<String> {
    if fs::metadata(path).map_err(err)?.len() > MAX_FILE { return Err("File exceeds the 5 MB editing limit".into()); }
    let text = fs::read_to_string(path).map_err(|_| "This file is not UTF-8 text".to_string())?;
    if text.contains('\0') { return Err("Binary files cannot be edited as text".into()); }
    Ok(text)
}
fn save_checked(path: &Path, content: &str, original: &str) -> Result<()> {
    if text_file(path)? != original { return Err("File changed on disk. Reload it before saving; your edits are still in the editor.".into()); }
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("Invalid parent")?).map_err(err)?;
    temp.as_file().set_permissions(fs::metadata(path).map_err(err)?.permissions()).map_err(err)?;
    temp.write_all(content.as_bytes()).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}
#[tauri::command]
async fn choose_folder(app: tauri::AppHandle, state: State<'_, Workspace>) -> Result<Option<String>> {
    let selected = app.dialog().file().blocking_pick_folder();
    if let Some(selected) = selected {
        let selected = selected.into_path().map_err(err)?.canonicalize().map_err(err)?;
        state.terminal.lock().map_err(err)?.take();
        *state.root.lock().map_err(err)? = Some(selected.clone());
        Ok(Some(selected.to_string_lossy().into_owned()))
    } else { Ok(None) }
}
#[tauri::command]
fn list_directory(state: State<Workspace>, path: String) -> Result<Vec<Entry>> {
    let root = root(&state)?;
    let dir = if path.is_empty() { root.clone() } else { checked(&root, &path)? };
    let mut entries = Vec::new();
    for item in fs::read_dir(dir).map_err(err)? {
        let item = item.map_err(err)?;
        if item.file_type().map_err(err)?.is_symlink() { continue; }
        let name = item.file_name().to_string_lossy().into_owned();
        if name == ".git" { continue; }
        entries.push(Entry { path: item.path().strip_prefix(&root).map_err(err)?.to_string_lossy().into_owned(), name, directory: item.file_type().map_err(err)?.is_dir() });
    }
    entries.sort_by_key(|e| (!e.directory, e.name.to_lowercase()));
    Ok(entries)
}
#[tauri::command]
fn read_file(state: State<Workspace>, path: String) -> Result<String> { text_file(&checked(&root(&state)?, &path)?) }
#[tauri::command]
fn save_file(state: State<Workspace>, path: String, content: String, original: String) -> Result<()> {
    save_checked(&checked(&root(&state)?, &path)?, &content, &original)
}
#[tauri::command]
fn create_entry(state: State<Workspace>, path: String, directory: bool) -> Result<()> {
    create_checked(&root(&state)?, &path, directory)
}
#[tauri::command]
fn rename_file(state: State<Workspace>, path: String, next: String) -> Result<()> {
    let root = root(&state)?;
    fs::rename(checked(&root, &path)?, destination(&root, &next)?).map_err(err)
}
#[tauri::command]
fn trash_file(state: State<Workspace>, path: String) -> Result<()> {
    let file = checked(&root(&state)?, &path)?;
    if !file.is_file() && !file.is_dir() { return Err("Only files and folders can be moved to Trash".into()); }
    trash::delete(file).map_err(err)
}
#[tauri::command]
fn copy_entry(state:State<Workspace>,path:String,next:String)->Result<()>{copy_checked(&root(&state)?,&path,&next)}
#[tauri::command]
fn duplicate_entry(state:State<Workspace>,path:String)->Result<String>{let root=root(&state)?;let next=duplicate_name(&root,&path)?;copy_checked(&root,&path,&next)?;Ok(next)}
#[tauri::command]
fn reveal_in_finder(state:State<Workspace>,path:String)->Result<()>{
    let target=checked(&root(&state)?,&path)?;
    #[cfg(target_os="macos")]
    {Command::new("open").arg("-R").arg(target).spawn().map(|_|()).map_err(err)}
    #[cfg(not(target_os="macos"))]
    {open::that(target.parent().unwrap_or(&target)).map_err(err)}
}
fn index(dir: &Path, base: &Path, files: &mut Vec<String>, depth: usize) {
    if depth > 25 || files.len() >= 10000 { return; }
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        if files.len() >= 10000 { break; }
        let Ok(kind) = entry.file_type() else { continue; };
        if kind.is_symlink() { continue; }
        let name = entry.file_name().to_string_lossy().into_owned();
        if [".git","node_modules","target","dist","build",".next",".venv","venv"].contains(&name.as_str()) { continue; }
        if kind.is_dir() { index(&entry.path(), base, files, depth + 1); }
        else if kind.is_file() { if let Ok(path) = entry.path().strip_prefix(base) { files.push(path.to_string_lossy().into_owned()); } }
    }
}
#[tauri::command]
async fn project_files(state: State<'_, Workspace>) -> Result<Vec<String>> {
    let root = root(&state)?;
    tauri::async_runtime::spawn_blocking(move || { let mut files = Vec::new(); index(&root, &root, &mut files, 0); files.sort(); files }).await.map_err(err)
}
fn relevant_context(root: &Path, query: &str, active: &str) -> Vec<ContextFile> {
    let tokens: Vec<String> = query.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|token| token.len() >= 3).take(16).map(str::to_lowercase).collect();
    if tokens.is_empty() { return Vec::new(); }
    let mut files=Vec::new();index(root,root,&mut files,0);
    let active_extension=Path::new(active).extension().and_then(|value|value.to_str()).unwrap_or("");
    let mut ranked=Vec::new();
    for relative in files.into_iter().take(3000) {
        let path=root.join(&relative);
        let Ok(metadata)=fs::metadata(&path) else {continue};
        if metadata.len()>256*1024 {continue;}
        let Ok(text)=fs::read_to_string(&path) else {continue};
        if text.contains('\0') {continue;}
        let lower_path=relative.to_lowercase();let lower_text=text.to_lowercase();
        let mut score=tokens.iter().map(|token|{
            let path_score=if lower_path.contains(token){24}else{0};
            path_score+lower_text.matches(token).count().min(8)
        }).sum::<usize>();
        if !active_extension.is_empty()&&Path::new(&relative).extension().and_then(|value|value.to_str())==Some(active_extension){score+=2;}
        if relative==active {score+=8;}
        if score>2 {
            let content:String=text.chars().take(7000).collect();
            ranked.push(ContextFile{path:relative,content,score});
        }
    }
    ranked.sort_by(|a,b|b.score.cmp(&a.score).then_with(||a.path.cmp(&b.path)));
    let mut bytes=0usize;
    ranked.into_iter().filter(|item|{bytes+=item.content.len();bytes<=36*1024}).take(6).collect()
}
#[tauri::command]
async fn ai_workspace_context(state:State<'_,Workspace>,query:String,active:String)->Result<Vec<ContextFile>>{
    if query.len()>8000{return Err("AI context query is too large".into());}
    let root=root(&state)?;
    tauri::async_runtime::spawn_blocking(move||relevant_context(&root,&query,&active)).await.map_err(err)
}
#[tauri::command]
async fn search_workspace(state: State<'_, Workspace>, query: String) -> Result<Vec<Match>> {
    let root = root(&state)?;
    if query.trim().is_empty() { return Ok(Vec::new()); }
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new(); index(&root, &root, &mut files, 0);
        let query = query.to_lowercase(); let mut matches = Vec::new();
        for path in files {
            if let Ok(text) = text_file(&root.join(&path)) {
                for (i, line) in text.lines().enumerate() {
                    if line.to_lowercase().contains(&query) {
                        matches.push(Match { path: path.clone(), line: i + 1, text: line.chars().take(240).collect() });
                        if matches.len() >= 500 { return matches; }
                    }
                }
            }
        }
        matches
    }).await.map_err(err)
}
#[tauri::command]
async fn git_status(state: State<'_, Workspace>) -> Result<String> {
    let root = root(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git").args(["--no-optional-locks", "status", "--short", "--branch"]).current_dir(root).output().map_err(err)?;
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
    }).await.map_err(err)?
}
#[tauri::command]
async fn git_diff(state: State<'_, Workspace>, path: String) -> Result<String> {
    let root = root(&state)?; checked(&root, &path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("git").args(["diff", "HEAD", "--", &path]).current_dir(root).output().map_err(err)?;
        if output.status.success() { Ok(String::from_utf8_lossy(&output.stdout).into_owned()) } else { Err(String::from_utf8_lossy(&output.stderr).into_owned()) }
    }).await.map_err(err)?
}
fn git_path(root: &Path, path: &str) -> Result<()> {
    if path.is_empty() || Path::new(path).components().any(|part| !matches!(part, Component::Normal(_))) { return Err("Invalid Git path".into()); }
    if !root.join(path).starts_with(root) { return Err("Git path is outside this workspace".into()); }
    Ok(())
}
fn git_run(root: PathBuf, args: Vec<String>) -> Result<String> {
    let output=Command::new("git").args(args).current_dir(root).output().map_err(err)?;
    if output.status.success(){Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())}else{Err(String::from_utf8_lossy(&output.stderr).trim().to_string())}
}
fn gh_program()->Option<PathBuf>{
    std::env::var_os("PATH").and_then(|paths|std::env::split_paths(&paths).map(|path|path.join("gh")).find(|path|path.is_file()))
        .or_else(||["/opt/homebrew/bin/gh","/usr/local/bin/gh","/usr/bin/gh"].iter().map(PathBuf::from).find(|path|path.is_file()))
}
fn gh_run(root:PathBuf,args:Vec<String>)->Result<String>{let program=gh_program().ok_or("GitHub CLI is not installed. Install it from cli.github.com and restart Veyra.")?;let output=Command::new(program).args(args).current_dir(root).output().map_err(err)?;if output.status.success(){Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())}else{Err(String::from_utf8_lossy(&output.stderr).trim().to_string())}}
#[tauri::command]
async fn git_stage(state:State<'_,Workspace>,path:String)->Result<String>{let root=root(&state)?;git_path(&root,&path)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["add".into(),"--".into(),path])).await.map_err(err)?}
#[tauri::command]
async fn git_unstage(state:State<'_,Workspace>,path:String)->Result<String>{let root=root(&state)?;git_path(&root,&path)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["restore".into(),"--staged".into(),"--".into(),path])).await.map_err(err)?}
#[tauri::command]
async fn git_discard(state:State<'_,Workspace>,path:String)->Result<String>{let root=root(&state)?;git_path(&root,&path)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["restore".into(),"--worktree".into(),"--".into(),path])).await.map_err(err)?}
#[tauri::command]
async fn git_commit(state:State<'_,Workspace>,message:String)->Result<String>{
    let message=message.trim().to_string();if message.is_empty(){return Err("Enter a commit message".into());}if message.len()>5000{return Err("Commit message is too long".into());}
    let root=root(&state)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["commit".into(),"-m".into(),message])).await.map_err(err)?
}
#[tauri::command]
async fn git_log(state:State<'_,Workspace>)->Result<String>{let root=root(&state)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["log".into(),"-12".into(),"--pretty=format:%h%x09%an%x09%ar%x09%s".into()])).await.map_err(err)?}
#[tauri::command]
async fn git_graph(state:State<'_,Workspace>)->Result<String>{let root=root(&state)?;tauri::async_runtime::spawn_blocking(move||git_run(root,vec!["log".into(),"-40".into(),"--date=relative".into(),"--pretty=format:%h%x09%p%x09%d%x09%an%x09%ad%x09%s".into(),"--all".into()])).await.map_err(err)?}
#[tauri::command]
async fn github_info(state:State<'_,Workspace>)->Result<GithubInfo>{
    let workspace=state.root.lock().map_err(err)?.clone();let root=workspace.clone().unwrap_or(std::env::current_dir().map_err(err)?);tauri::async_runtime::spawn_blocking(move||{
        if gh_program().is_none(){return Ok(GithubInfo::default());}
        let mut info=GithubInfo{available:true,..Default::default()};
        if let Ok(user)=gh_run(root.clone(),vec!["api".into(),"user".into(),"--jq".into(),"[.login,(.name // \"\"),.avatar_url]|@tsv".into()]){
            let fields:Vec<_>=user.split('\t').collect();if fields.len()>=3{info.authenticated=true;info.login=fields[0].into();info.name=fields[1].into();info.avatar=fields[2].into();}
        }
        if info.authenticated&&workspace.is_some() {if let Ok(repo)=gh_run(root,vec!["repo".into(),"view".into(),"--json".into(),"nameWithOwner,url,visibility,defaultBranchRef".into(),"--jq".into(),"[.nameWithOwner,.url,.visibility,(.defaultBranchRef.name // \"\")]|@tsv".into()]){let fields:Vec<_>=repo.split('\t').collect();if fields.len()>=4{info.repository=fields[0].into();info.url=fields[1].into();info.visibility=fields[2].into();info.default_branch=fields[3].into();}}}
        Ok(info)
    }).await.map_err(err)?
}
#[tauri::command]
async fn github_login()->Result<String>{tauri::async_runtime::spawn_blocking(||gh_run(std::env::current_dir().map_err(err)?,vec!["auth".into(),"login".into(),"--hostname".into(),"github.com".into(),"--web".into(),"--git-protocol".into(),"https".into()])).await.map_err(err)?}
#[tauri::command]
async fn github_open(state:State<'_,Workspace>)->Result<String>{let root=root(&state)?;tauri::async_runtime::spawn_blocking(move||gh_run(root,vec!["repo".into(),"view".into(),"--web".into()])).await.map_err(err)?}
#[tauri::command]
async fn git_remote_action(state:State<'_,Workspace>,action:String)->Result<String>{
    if !matches!(action.as_str(),"fetch"|"pull"|"push"){return Err("Unsupported remote action".into());}let root=root(&state)?;
    tauri::async_runtime::spawn_blocking(move||{let args=if action=="pull"{vec!["pull".into(),"--ff-only".into()]}else{vec![action]};git_run(root,args)}).await.map_err(err)?
}
#[tauri::command]
fn terminal_start(state: State<Workspace>, output: Channel<Vec<u8>>) -> Result<()> {
    let root = root(&state)?;
    let mut session = state.terminal.lock().map_err(err)?;
    session.take();
    let pair = native_pty_system().openpty(PtySize { rows: 24, cols: 100, pixel_width: 0, pixel_height: 0 }).map_err(err)?;
    let mut command = CommandBuilder::new(std::env::var("SHELL").unwrap_or("/bin/zsh".into()));
    command.arg("-l"); command.cwd(root); command.env("TERM", "xterm-256color");
    let child = pair.slave.spawn_command(command).map_err(err)?;
    let mut reader = pair.master.try_clone_reader().map_err(err)?;
    let writer = pair.master.take_writer().map_err(err)?;
    *session = Some(TerminalSession { master: pair.master, writer, child });
    std::thread::spawn(move || { let mut buf = [0; 8192]; while let Ok(n) = reader.read(&mut buf) { if n == 0 || output.send(buf[..n].to_vec()).is_err() { break; } } });
    Ok(())
}
#[tauri::command]
fn terminal_write(state: State<Workspace>, data: String) -> Result<()> {
    if let Some(session) = state.terminal.lock().map_err(err)?.as_mut() { session.writer.write_all(data.as_bytes()).map_err(err)?; session.writer.flush().map_err(err)?; }
    Ok(())
}
#[tauri::command]
fn terminal_resize(state: State<Workspace>, rows: u16, cols: u16) -> Result<()> {
    if let Some(session) = state.terminal.lock().map_err(err)?.as_mut() { session.master.resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }).map_err(err)?; }
    Ok(())
}
#[tauri::command]
fn terminal_stop(state: State<Workspace>) { if let Ok(mut session) = state.terminal.lock() { session.take(); } }
#[tauri::command]
fn set_dirty(state: State<Workspace>, dirty: bool) { state.dirty.store(dirty, Ordering::SeqCst); }
#[tauri::command]
fn quit(app: tauri::AppHandle, state: State<Workspace>) { state.dirty.store(false, Ordering::SeqCst); app.exit(0); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default().manage(Workspace::default()).manage(ai::AiState::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app|{app.set_menu(application_menu(app)?)?;Ok(())})
        .on_menu_event(|app,event|{let _=app.emit("menu-command",event.id().as_ref());})
        .invoke_handler(tauri::generate_handler![choose_folder, list_directory, read_file, save_file, create_entry, rename_file, trash_file, copy_entry, duplicate_entry, reveal_in_finder, project_files, search_workspace, ai_workspace_context, git_status, git_diff, git_stage, git_unstage, git_discard, git_commit, git_log, git_graph, github_info, github_login, github_open, git_remote_action, terminal_start, terminal_write, terminal_resize, terminal_stop, set_dirty, quit, ai::ai_set_key, ai::ai_models, ai::ai_chat, ai::ai_cancel])
        .on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event { if window.state::<Workspace>().dirty.load(Ordering::SeqCst) { api.prevent_close(); let _ = window.emit("confirm-quit", ()); } } })
        .build(tauri::generate_context!()).expect("error while running Veyra")
        .run(|app, event| { if let tauri::RunEvent::ExitRequested { api, .. } = event { if app.state::<Workspace>().dirty.load(Ordering::SeqCst) { api.prevent_exit(); let _ = app.emit("confirm-quit", ()); } } });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn traversal_and_overwrite_are_rejected() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().canonicalize().unwrap();
        fs::write(base.join("keep.txt"), "original").unwrap();
        assert!(destination(&base, "../escape").is_err());
        assert!(destination(&base, "/tmp/escape").is_err());
        assert!(destination(&base, "keep.txt").is_err());
        assert!(checked(&base, "../escape").is_err());
    }
    #[test] fn save_preserves_external_changes() {
        let dir = tempfile::tempdir().unwrap(); let file = dir.path().join("a.ts");
        fs::write(&file, "original").unwrap();
        save_checked(&file, "updated", "original").unwrap();
        assert_eq!(text_file(&file).unwrap(), "updated");
        assert!(save_checked(&file, "stale edit", "original").is_err());
        assert_eq!(text_file(&file).unwrap(), "updated");
    }
    #[test] fn nested_files_and_folders_are_created() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().canonicalize().unwrap();
        create_checked(&base, "src/components/Button.tsx", false).unwrap();
        assert!(base.join("src/components").is_dir());
        assert_eq!(fs::read_to_string(base.join("src/components/Button.tsx")).unwrap(), "");
        create_checked(&base, "src/components/forms/fields", true).unwrap();
        assert!(base.join("src/components/forms/fields").is_dir());
        create_checked(&base, "src/components/forms/fields/input.ts", false).unwrap();
        assert!(base.join("src/components/forms/fields/input.ts").is_file());
    }
    #[test] fn nested_creation_never_overwrites_entries() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().canonicalize().unwrap();
        fs::write(base.join("keep.txt"), "original").unwrap();
        fs::create_dir(base.join("existing")).unwrap();
        for directory in [true, false] {
            assert!(create_checked(&base, "keep.txt", directory).is_err());
            assert!(create_checked(&base, "existing", directory).is_err());
            assert!(create_checked(&base, "keep.txt/nested/new", directory).is_err());
        }
        assert_eq!(fs::read_to_string(base.join("keep.txt")).unwrap(), "original");
        assert!(base.join("existing").is_dir());
    }
    #[test] fn invalid_nested_paths_have_no_side_effects() {
        let dir = tempfile::tempdir().unwrap(); let base = dir.path().canonicalize().unwrap();
        for path in ["", "../escape", "/tmp/escape", "new/../escape", "new/./file", "new//file", "new/", "new\\file", "new/ /file", "new/file\0"] {
            for directory in [true, false] { assert!(create_checked(&base, path, directory).is_err(), "accepted {path:?}"); }
        }
        assert_eq!(fs::read_dir(&base).unwrap().count(), 0);
    }
    #[cfg(unix)]
    #[test] fn nested_creation_rejects_symlinks_including_internal_and_dangling() {
        let dir = tempfile::tempdir().unwrap(); let outside = tempfile::tempdir().unwrap();
        let base = dir.path().canonicalize().unwrap();
        fs::create_dir(base.join("real")).unwrap();
        std::os::unix::fs::symlink(outside.path(), base.join("escape")).unwrap();
        std::os::unix::fs::symlink(base.join("real"), base.join("internal")).unwrap();
        std::os::unix::fs::symlink(base.join("missing"), base.join("dangling")).unwrap();
        for path in ["escape/new/file", "internal/new/file", "dangling/new/file", "escape", "internal", "dangling"] {
            for directory in [true, false] { assert!(create_checked(&base, path, directory).is_err(), "accepted {path}"); }
        }
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
        assert_eq!(fs::read_dir(base.join("real")).unwrap().count(), 0);
        assert!(!base.join("missing").exists());
    }
    #[cfg(unix)]
    #[test] fn symlink_escape_rejected() {
        let a = tempfile::tempdir().unwrap(); let b = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(b.path(), a.path().join("escape")).unwrap();
        let base = a.path().canonicalize().unwrap();
        assert!(destination(&base, "escape/file").is_err());
        assert!(checked(&base, "escape").is_err());
    }
    #[test] fn workspace_context_prefers_relevant_files_and_stays_bounded() {
        let dir=tempfile::tempdir().unwrap();let base=dir.path().canonicalize().unwrap();
        fs::create_dir(base.join("src")).unwrap();
        fs::write(base.join("src/auth.ts"),"export function authenticateUser() { return verifyToken(); }").unwrap();
        fs::write(base.join("src/colors.ts"),"export const blue = '#00f';").unwrap();
        fs::write(base.join("README.md"),"Authentication uses signed tokens.").unwrap();
        let result=relevant_context(&base,"how does authentication verify token work?","src/auth.ts");
        assert!(!result.is_empty());
        assert_eq!(result[0].path,"src/auth.ts");
        assert!(result.iter().all(|file|file.content.len()<=7000));
        assert!(result.iter().map(|file|file.content.len()).sum::<usize>()<=36*1024);
        assert!(!result.iter().any(|file|file.path=="src/colors.ts"));
    }
    #[test] fn copy_and_duplicate_preserve_trees_without_overwriting() {
        let dir=tempfile::tempdir().unwrap();let base=dir.path().canonicalize().unwrap();
        fs::create_dir(base.join("src")).unwrap();fs::write(base.join("src/main.ts"),"hello").unwrap();
        copy_checked(&base,"src","backup").unwrap();
        assert_eq!(fs::read_to_string(base.join("backup/main.ts")).unwrap(),"hello");
        assert!(copy_checked(&base,"src","backup").is_err());
        assert!(copy_checked(&base,"src","src/nested").is_err());
        let next=duplicate_name(&base,"src/main.ts").unwrap();assert_eq!(next,"src/main copy.ts");
        copy_checked(&base,"src/main.ts",&next).unwrap();
        assert_eq!(duplicate_name(&base,"src/main.ts").unwrap(),"src/main copy 2.ts");
    }
}
