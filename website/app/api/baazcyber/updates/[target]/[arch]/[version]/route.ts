// Update endpoint for installed copies of BaazCyber Antivirus:
//   GET /api/baazcyber/updates/{{target}}/{{arch}}/{{current_version}}
// 204 = already up to date; 200 = Tauri's dynamic update response with a signed download.
import { NextResponse } from "next/server";
import { isNewer } from "@/lib/releases";

export const revalidate = 300;

const REPO = "fcopensource/baazcyber";

async function baazManifest() {
  const url = `https://github.com/${REPO}/releases/latest/download/latest.json`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3500),
      headers: {
        Accept: "application/json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function GET(_request: Request, { params }: { params: Promise<{ target: string; arch: string; version: string }> }) {
  const { target, arch, version } = await params;
  const manifest = await baazManifest();
  if (!manifest || !isNewer(manifest.version, version)) return new NextResponse(null, { status: 204 });
  const key = `${target}-${arch}`;
  const platform = manifest.platforms?.[key] ||
    Object.entries(manifest.platforms ?? {}).find(([name]) => name.startsWith(key + "-"))?.[1];
  if (!platform) return new NextResponse(null, { status: 204 });
  return NextResponse.json({
    version: manifest.version,
    notes: manifest.notes || "",
    pub_date: manifest.pub_date,
    url: (platform as { url: string }).url,
    signature: (platform as { signature: string }).signature,
  });
}
