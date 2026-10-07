// Release data for the download page and the in-app updater, cached for five minutes.
const REPO = process.env.VEYRA_RELEASES_REPO || "fcopensource/veyraeditor";
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

type Asset = { name: string; browser_download_url: string; size: number };
export type Release = { version: string; publishedAt: string; assets: Asset[] };
export type Manifest = { version: string; notes?: string; pub_date?: string; platforms: Record<string, { signature: string; url: string }> };

export async function latestRelease(): Promise<Release | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 300 },
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
    const response = await fetch(url, { next: { revalidate: 300 } });
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
    });
    if (!response.ok) return [];
    const data: { tag_name: string; name: string; published_at: string; body: string | null; html_url: string; draft: boolean; assets: unknown[] }[] = await response.json();
    // Skip drafts and placeholder releases with no files.
    return data.filter(r => !r.draft && r.assets.length).map(r => ({ version: r.tag_name.replace(/^v/, ""), name: r.name, publishedAt: r.published_at, body: r.body || "", url: r.html_url }));
  } catch { return []; }
}
