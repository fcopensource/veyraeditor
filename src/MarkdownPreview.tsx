import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Eye, X } from "lucide-react";

type Props = { path: string; text: string; onClose: () => void; onOpenLink: (path: string) => void };

/** Live, sanitized preview of a Markdown buffer; relative links open inside the workspace. */
export function MarkdownPreview({ path, text, onClose, onOpenLink }: Props) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true }) as string), [text]);
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  return <div className="markdown-pane">
    <div className="pane-header"><Eye size={13}/><span>Preview · {path.split("/").pop()}</span><button title="Close preview" aria-label="Close preview" onClick={onClose}><X size={13}/></button></div>
    <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} onClick={event => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) return;
      event.preventDefault();
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#")) { document.getElementById(href.slice(1))?.scrollIntoView(); return; }
      if (/^[a-z]+:/i.test(href)) return; // External links stay inert inside the desktop shell.
      const parts: string[] = [];
      for (const part of (folder + decodeURIComponent(href.split("#")[0])).split("/")) { if (part === "..") parts.pop(); else if (part && part !== ".") parts.push(part); }
      onOpenLink(parts.join("/"));
    }}/>
  </div>;
}
