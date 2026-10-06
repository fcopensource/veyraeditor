"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

type OS = "Windows" | "macOS" | "Linux" | null;

/** Primary download button that names the visitor's operating system once it is known. */
export function DownloadCTA({ className = "primary" }: { className?: string }) {
  const [os, setOs] = useState<OS>(null);
  useEffect(() => {
    const agent = navigator.userAgent;
    setOs(/Windows/i.test(agent) ? "Windows" : /Mac/i.test(agent) && !/iPhone|iPad/i.test(agent) ? "macOS" : /Linux|X11/i.test(agent) && !/Android/i.test(agent) ? "Linux" : null);
  }, []);
  return (
    <Link className={className} href="/download">
      <Download size={17} />
      {os ? `Download for ${os}` : "Download Veyra"}
    </Link>
  );
}
