import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { fetchDetails } from './extensions';

/** What an extension page tab shows: a marketplace extension, or one of Veyra's built-in language tools. */
export type ExtensionTarget =
  | { kind: 'market'; namespace: string; name: string; title: string; icon?: string }
  | { kind: 'tool'; key: string; title: string; icon?: string };
export const PAGE_PREFIX = 'veyra-ext:';
export const targetId = (target: ExtensionTarget) => PAGE_PREFIX + (target.kind === 'tool' ? 'tool:' + target.key : `${target.namespace}.${target.name}`.toLowerCase());
export const marketTarget = (id: string, title: string, icon?: string): ExtensionTarget => {
  const dot = id.indexOf('.');
  return { kind: 'market', namespace: id.slice(0, dot), name: id.slice(dot + 1), title, icon };
};

/** Icon URL of a marketplace extension ("publisher.name"), looked up once per session. */
export function useMarketIcon(id?: string) {
  const [icon, setIcon] = useState<string>();
  useEffect(() => {
    if (!id || !id.includes('.')) return;
    let current = true;
    const dot = id.indexOf('.');
    fetchDetails(id.slice(0, dot), id.slice(dot + 1)).then(details => { if (current && details.files?.icon) setIcon(details.files.icon); }).catch(() => {});
    return () => { current = false; };
  }, [id]);
  return icon;
}

/** Deterministic colours per name, so extensions without an icon still look distinct. */
function hue(text: string) { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '?') + (words.length > 1 ? words[1][0] : words[0]?.[1] || '')).toUpperCase();
}

/** The extension's real icon, or a coloured monogram while it loads or when it has none. */
export function ExtIcon({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.22) };
  if (src && !failed) return <img className="ext-icon" src={src} alt="" style={style} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
  const h = hue(name);
  return <span className="ext-icon ext-monogram" aria-hidden="true" style={{ ...style, fontSize: Math.round(size * 0.38), background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 75% 42%))` }}>{initials(name)}</span>;
}

/** ★★★★☆ with half stars, plus the review count. */
export function Rating({ value, count, size = 12 }: { value?: number; count?: number; size?: number }) {
  if (!value) return null;
  return <span className="ext-rating" title={`Rated ${value.toFixed(1)} out of 5${count ? ` (${count} reviews)` : ''}`}>
    {[0, 1, 2, 3, 4].map(i => { const fill = Math.max(0, Math.min(1, value - i)); return <span key={i} className="ext-star"><Star size={size} /><span style={{ width: `${fill * 100}%` }}><Star size={size} /></span></span>; })}
    {count ? <small>({count})</small> : null}
  </span>;
}
