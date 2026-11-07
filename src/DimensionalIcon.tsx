import { languageFor } from './editor';

/* Flat 16 px file and folder icons in the style of a modern IDE: outlined folders tinted by their role,
   and files as compact language badges. Exported under its original name, so every list uses it. */

type Badge = { color: string; label: string; ink?: string };
const LANGUAGES: Record<string, Badge> = {
  typescript: { color: '#3178c6', label: 'TS' }, javascript: { color: '#e5c33e', label: 'JS', ink: '#1e1f22' },
  json: { color: '#e5a13a', label: '{}', ink: '#1e1f22' }, css: { color: '#8e6fe0', label: '#' }, scss: { color: '#c6538c', label: 'S' },
  less: { color: '#3d6ba8', label: 'L' }, html: { color: '#e36e3a', label: '<>' }, markdown: { color: '#5c88da', label: 'M' },
  python: { color: '#3d7fc8', label: 'Py' }, rust: { color: '#ce7a4e', label: 'Rs' }, go: { color: '#00a3c4', label: 'Go' },
  java: { color: '#e76f00', label: 'J' }, kotlin: { color: '#8f69e3', label: 'K' }, swift: { color: '#f05138', label: 'Sw' },
  c: { color: '#5c8dd6', label: 'C' }, cpp: { color: '#5c8dd6', label: 'C+' }, php: { color: '#7a86b8', label: 'P' },
  ruby: { color: '#cc342d', label: 'Rb' }, sql: { color: '#d18a2e', label: 'DB', ink: '#1e1f22' }, yaml: { color: '#cb4b5a', label: 'Y' },
  xml: { color: '#e5a13a', label: '</>', ink: '#1e1f22' }, shell: { color: '#4f9a5e', label: '>_' }, vue: { color: '#41b883', label: 'V' },
  svelte: { color: '#ff3e00', label: 'S' }, dockerfile: { color: '#2496ed', label: 'D' },
};
const IMAGES = /\.(png|jpe?g|gif|webp|ico|bmp|avif)$/i;

function folderColor(path: string) {
  const name = path.split('/').pop()!.toLowerCase();
  if (/^(node_modules|dist|build|out|target|\.next|coverage|vendor|bin|obj)$/.test(name)) return '#d08a4e';
  if (/^(\.git|\.github|\.vscode|\.idea|\.cargo|\.husky)$/.test(name)) return '#8c8f94';
  if (/^(tests?|__tests__|specs?|e2e|cypress)$/.test(name)) return '#5fb865';
  if (/^(public|assets|static|res|resources|images|img|media|fonts|icons)$/.test(name)) return '#b57ad9';
  if (/^(src|source|lib|app|main|packages|crates|components|pages|routes)$/.test(name)) return '#548af7';
  return '#a2a8b6';
}

const DOC = 'M4 1.5h5.4l3.1 3.1v9.4a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z';

export function DimensionalIcon({ path, directory = false, open = false }: { path: string; directory?: boolean; open?: boolean }) {
  const name = path.split('/').pop()!.toLowerCase();
  if (directory) {
    const color = folderColor(path);
    return <span className={'dimensional-icon is-folder' + (open ? ' is-open' : '')}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 3h3.9c.3 0 .5.1.7.3l1.3 1.3H14a1 1 0 0 1 1 1v6.9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill={color} fillOpacity={open ? .16 : .26} stroke={color} strokeWidth="1" strokeLinejoin="round" />
        {open && <path d="M2.6 7h12.1a.6.6 0 0 1 .58.75l-1.25 4.9a1 1 0 0 1-.97.75H1.6l.55-5.8A.6.6 0 0 1 2.6 7z" fill={color} fillOpacity=".38" stroke={color} strokeWidth="1" strokeLinejoin="round" />}
      </svg>
    </span>;
  }
  const language = languageFor(path);
  const badge = name === '.gitignore' || name === '.gitattributes' ? { color: '#f05033', label: 'G' } : LANGUAGES[language];
  const glyph = IMAGES.test(name) ? 'image' : /^\.env/.test(name) ? 'key' : /(\.lock|-lock\.json|lock\.yaml)$/.test(name) ? 'lock' : null;
  return <span className={'dimensional-icon is-file'}>
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {badge && !glyph ? <>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill={badge.color} />
        <text x="8" y={badge.label.length > 2 ? 10.6 : 11} fill={badge.ink || '#fff'} fontFamily="Inter, 'Segoe UI', Arial, sans-serif" fontSize={badge.label.length > 2 ? 5 : badge.label.length > 1 ? 6.4 : 8} fontWeight="800" textAnchor="middle">{badge.label}</text>
      </> : <>
        <path d={DOC} fill="#8c8f94" fillOpacity=".14" stroke="#9da0a8" strokeWidth="1" strokeLinejoin="round" />
        <path d="M9.4 1.5v3.1h3.1" fill="none" stroke="#9da0a8" strokeWidth="1" strokeLinejoin="round" />
        {glyph === 'image' && <><circle cx="6.4" cy="8" r="1.1" fill="#5fb865" /><path d="M4.6 12.6 7 10l1.4 1.4 1.7-2.3 2 3.5" fill="none" stroke="#5fb865" strokeWidth="1.1" strokeLinejoin="round" /></>}
        {glyph === 'key' && <><circle cx="6.6" cy="9.4" r="1.6" fill="none" stroke="#d8b44a" strokeWidth="1.1" /><path d="M8.1 9.4h3.4M10.4 9.4v1.4" stroke="#d8b44a" strokeWidth="1.1" strokeLinecap="round" /></>}
        {glyph === 'lock' && <><rect x="5.3" y="8.6" width="5.4" height="3.9" rx=".8" fill="#9da0a8" /><path d="M6.4 8.6V7.5a1.6 1.6 0 0 1 3.2 0v1.1" fill="none" stroke="#9da0a8" strokeWidth="1.1" /></>}
        {!glyph && <path d="M5.5 8.5h5M5.5 10.5h5M5.5 12.5h3" stroke="#9da0a8" strokeWidth=".9" strokeLinecap="round" />}
      </>}
    </svg>{['typescript', 'javascript'].includes(language) && <span className="sr-only">{badge?.label}</span>}
  </span>;
}
