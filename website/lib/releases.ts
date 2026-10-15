// Release data for the download page and the in-app updater, cached for five minutes.
const REPO = process.env.VEYRA_RELEASES_REPO || "fcopensource/veyraeditor";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string; size: number; digest?: string | null };
export type Release = { version: string; publishedAt: string; assets: Asset[] };
export type Manifest = { version: string; notes?: string; pub_date?: string; platforms: Record<string, { signature: string; url: string }> };

// Release data enhances the page, but a blocked GitHub request must never hold
// the website open. Hostinger occasionally restricts this outbound request.
const releaseSignal = () => AbortSignal.timeout(Number(process.env.RELEASE_FETCH_TIMEOUT_MS) || 3500);

/** The latest release of Veyra, or of another repository such as fcopensource/salesforce-studio. */
export async function latestRelease(repo = REPO): Promise<Release | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 300 },
      signal: releaseSignal(),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return { version: String(data.tag_name || "").replace(/^v/, ""), publishedAt: data.published_at, assets: data.assets || [] };
  } catch { return null; }
}

/** The signed manifest produced by the release workflow. Point UPDATE_MANIFEST_URL elsewhere to self-host. */
export async function updateManifest(): Promise<Manifest | null> {
  const url = process.env.UPDATE_MANIFEST_URL || `https://github.com/${REPO}/releases/latest/download/latest.json`;
  try {
    const response = await fetch(url, { next: { revalidate: 300 }, signal: releaseSignal() });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

/** Installer for each platform, matched on the file names Tauri produces. */
export function installers(release: Release | null) {
  const find = (test: (name: string) => boolean) => release?.assets.find(asset => test(asset.name.toLowerCase()));
  return {
    windows: find(name => name.endsWith("-setup.exe")) || find(name => name.endsWith(".msi")),
    windowsMsi: find(name => name.endsWith(".msi")),
    macArm: find(name => name.endsWith(".dmg") && name.includes("aarch64")),
    macIntel: find(name => name.endsWith(".dmg") && (name.includes("x64") || name.includes("x86_64"))),
    appImage: find(name => name.endsWith(".appimage")),
    deb: find(name => name.endsWith(".deb")),
    rpm: find(name => name.endsWith(".rpm")),
  };
}

/** Compare dotted versions numerically; pre-release suffixes sort before the release. */
export function isNewer(candidate: string, current: string) {
  const parse = (v: string) => { const [core, pre] = v.replace(/^v/, "").split("-"); return { parts: core.split(".").map(n => parseInt(n, 10) || 0), pre }; };
  const a = parse(candidate), b = parse(current);
  for (let i = 0; i < 3; i++) if ((a.parts[i] || 0) !== (b.parts[i] || 0)) return (a.parts[i] || 0) > (b.parts[i] || 0);
  return !a.pre && !!b.pre;
}

export type ReleaseNote = { version: string; name: string; publishedAt: string; body: string; url: string };

/** Published releases, newest first, for the changelog page. */
export async function releaseNotes(limit = 20): Promise<ReleaseNote[]> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${limit}`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 300 },
      signal: releaseSignal(),
    });
    if (!response.ok) return [];
    const data: { tag_name: string; name: string; published_at: string; body: string | null; html_url: string; draft: boolean; assets: unknown[] }[] = await response.json();
    // Skip drafts and placeholder releases with no files.
    return data.filter(r => !r.draft && r.assets.length).map(r => ({ version: r.tag_name.replace(/^v/, ""), name: r.name, publishedAt: r.published_at, body: r.body || "", url: r.html_url }));
  } catch { return []; }
}

const mb = (bytes: number) => Math.round(bytes / 1048576);
/** Installer sizes from the actual release files: the native installers' range, and the larger self-contained AppImage. */
export function installerSizes(release: Release | null) {
  const native = (release?.assets || []).filter(a => /(-setup\.exe|\.msi|\.dmg|\.deb|\.rpm)$/i.test(a.name)).map(a => mb(a.size)).filter(Boolean);
  const appImage = release?.assets.find(a => /\.appimage$/i.test(a.name));
  if (!native.length) return { label: "Small native installers", min: 0, max: 0, appImage: 0 };
  const min = Math.min(...native), max = Math.max(...native);
  return { label: min === max ? `${min} MB installers` : `${min}–${max} MB installers`, min, max, appImage: appImage ? mb(appImage.size) : 0 };
}
/** SHA-256 of each downloadable file, as published by GitHub for the release. */
export function checksums(release: Release | null) {
  return (release?.assets || []).filter(a => a.digest?.startsWith("sha256:") && !/\.(sig|json)$/i.test(a.name))
    .map(a => ({ name: a.name, sha256: a.digest!.slice(7), size: mb(a.size), url: a.browser_download_url }));
}
