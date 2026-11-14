/* Real install and download counts, for social proof that's always true: VS Code Marketplace installs, Open VSX
   downloads and Veyra Studio installer downloads from GitHub Releases. Cached for an hour; on any error the numbers
   are simply left out, never guessed. */

const PUBLISHER = "flightcoders";
const REPO = "fcopensource/veyraeditor";
const HOUR = 3600;

/** Counts are shown once they reach this: an extension's installs, and the site-wide downloads total. Below it, nothing is shown. */
export const SHOW_INSTALLS_FROM = 1000;

/** 950 → "950", 1234 → "1.2K", 90000 → "90K", 1250000 → "1.3M". */
export function compact(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const [value, unit] = n < 1_000_000 ? [n / 1000, "K"] : n < 1_000_000_000 ? [n / 1_000_000, "M"] : [n / 1_000_000_000, "B"];
  return (value >= 100 ? Math.floor(value).toString() : (Math.floor(value * 10) / 10).toString().replace(/\.0$/, "")) + unit;
}
/** A total rounded down to a tidy figure for "950+ downloads": never more than the real number. */
export function roundedDown(n: number): number {
  if (n < 100) return n;
  if (n < 1000) return Math.floor(n / 50) * 50;
  const step = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.floor(n / step) * step;
}

/** VS Code Marketplace installs per extension name ("veyra-live-server" → 176). */
export async function marketplaceInstalls(): Promise<Record<string, number>> {
  try {
    const response = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
      body: JSON.stringify({ filters: [{ criteria: [{ filterType: 18, value: PUBLISHER }], pageSize: 100 }], flags: 914 }),
      next: { revalidate: HOUR },
    });
    if (!response.ok) return {};
    const data = await response.json();
    const result: Record<string, number> = {};
    for (const ext of data?.results?.[0]?.extensions ?? []) {
      const installs = (ext.statistics ?? []).find((s: { statisticName: string }) => s.statisticName === "install")?.value;
      if (typeof installs === "number") result[ext.extensionName] = installs;
    }
    return result;
  } catch { return {}; }
}

/** Open VSX downloads per extension name (Cursor, VSCodium, Windsurf). */
export async function openVsxDownloads(): Promise<Record<string, number>> {
  try {
    const response = await fetch(`https://open-vsx.org/api/-/search?q=${PUBLISHER}&size=100`, { next: { revalidate: HOUR } });
    if (!response.ok) return {};
    const data = await response.json();
    const result: Record<string, number> = {};
    for (const ext of data?.extensions ?? []) if (ext.namespace === PUBLISHER && typeof ext.downloadCount === "number") result[ext.name] = ext.downloadCount;
    return result;
  } catch { return {}; }
}

/** Veyra Studio installer downloads across every release (not signatures, update manifests or bundled .vsix files). */
export async function appDownloads(): Promise<number> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" }, next: { revalidate: HOUR } });
    if (!response.ok) return 0;
    const releases = await response.json();
    let total = 0;
    for (const release of Array.isArray(releases) ? releases : []) for (const asset of release.assets ?? []) if (!/\.(sig|json|vsix)$/.test(asset.name)) total += asset.download_count ?? 0;
    return total;
  } catch { return 0; }
}

export interface Stats { perExtension: Record<string, number>; extensions: number; app: number; total: number }
/** Installs per extension (Marketplace + Open VSX), and the totals. */
export async function stats(): Promise<Stats> {
  const [market, vsx, app] = await Promise.all([marketplaceInstalls(), openVsxDownloads(), appDownloads()]);
  const perExtension: Record<string, number> = { ...market };
  for (const [name, n] of Object.entries(vsx)) perExtension[name] = (perExtension[name] ?? 0) + n;
  const extensions = Object.values(perExtension).reduce((sum, n) => sum + n, 0);
  return { perExtension, extensions, app, total: extensions + app };
}

/** The Marketplace name of an extension page: "/live-server" → "veyra-live-server". */
export const extensionName = (href: string) => "veyra-" + href.replace(/^\//, "");
/** "1.2K installs", or null while it is below SHOW_INSTALLS_FROM. */
export function installsLabel(n: number | undefined): string | null {
  return n !== undefined && n >= SHOW_INSTALLS_FROM ? `${compact(n)} install${n === 1 ? "" : "s"}` : null;
}
