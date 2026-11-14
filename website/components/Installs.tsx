import { Download } from "lucide-react";
import { installsLabel, stats } from "@/lib/stats";

/** The real install count of one extension (Marketplace + Open VSX), or a "New" badge while it's still small. */
export async function Installs({ id, className = "installs-badge" }: { id: string; className?: string }) {
  const name = id.includes(".") ? id.split(".").slice(1).join(".") : id;
  const label = installsLabel((await stats()).perExtension[name]);
  return label
    ? <span className={className} title="Installs from the VS Code Marketplace and Open VSX"><Download size={13} aria-hidden="true" />{label}</span>
    : <span className={className + " new"}>New</span>;
}
