// Update endpoint for installed copies of Veyra:
//   GET /api/updates/{{target}}/{{arch}}/{{current_version}}
// 204 = already up to date; 200 = Tauri's dynamic update response with a signed download.
import { NextResponse } from "next/server";
import { isNewer, updateManifest } from "@/lib/releases";

export const revalidate = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ target: string; arch: string; version: string }> }) {
  const { target, arch, version } = await params;
  const manifest = await updateManifest();
  if (!manifest || !isNewer(manifest.version, version)) return new NextResponse(null, { status: 204 });
  // Tauri writes both "windows-x86_64" and installer-specific keys such as "windows-x86_64-nsis".
  const key = `${target}-${arch}`;
  const platform = manifest.platforms[key] || Object.entries(manifest.platforms).find(([name]) => name.startsWith(key + "-"))?.[1];
  if (!platform) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ version: manifest.version, notes: manifest.notes || "", pub_date: manifest.pub_date, url: platform.url, signature: platform.signature });
}
