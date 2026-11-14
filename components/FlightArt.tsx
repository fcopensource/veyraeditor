/* Decorative artwork for the FlightCoders page, in the brand palette (amber → coral → violet on deep indigo). Pure SVG,
   drawn here, so it's sharp at any size and costs no image downloads. Both are decorative: hidden from screen readers. */

/** Mixes two hex colours: t = 0 gives a, t = 1 gives b. */
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
/** A colour along a list of stops, t from 0 to 1. */
function along(stops: string[], t: number) {
  const scaled = Math.min(stops.length - 1.0001, Math.max(0, t * (stops.length - 1)));
  const i = Math.floor(scaled);
  return mix(stops[i], stops[i + 1], scaled - i);
}

/** Layered planes for the "For businesses" panel: large rounded sheets lifting toward the top right. */
export function BusinessArt() {
  return <svg className="fc-art fc-art-business" viewBox="0 0 900 520" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="fba" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#3b1650"/><stop offset="1" stopColor="#6b2a8c"/></linearGradient>
      <linearGradient id="fbb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#7a2a7c"/><stop offset=".6" stopColor="#b8456f"/><stop offset="1" stopColor="#d26a52"/></linearGradient>
      <linearGradient id="fbc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9563f"/><stop offset="1" stopColor="#8b2f7e"/></linearGradient>
      <linearGradient id="fbd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9558ec" stopOpacity="0"/><stop offset="1" stopColor="#9558ec" stopOpacity=".55"/></linearGradient>
      <filter id="fbgrain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .06 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    </defs>
    <path d="M300 520 L420 0 H900 V520 Z" fill="url(#fba)" opacity=".55"/>
    <path d="M470 520 C 440 380, 450 180, 520 60 C 545 18, 600 0, 650 0 H900 V520 Z" fill="url(#fbb)" opacity=".92"/>
    <path d="M610 410 C 560 360, 560 230, 640 150 C 690 100, 760 70, 900 60 V420 C 820 430, 680 470, 610 410 Z" fill="url(#fbc)"/>
    <path d="M640 0 L900 120 V0 Z" fill="url(#fbd)"/>
    <path d="M700 520 L900 300 V520 Z" fill="#9558ec" opacity=".28"/>
    <rect width="900" height="520" filter="url(#fbgrain)"/>
  </svg>;
}

/** A fan of rounded tiles turning around one corner, from large deep-violet tiles to a small warm one: the f/c tile, multiplied. */
export function FanArt() {
  const stops = ["#1c1550", "#3b23a8", "#6a35e0", "#a23fd6", "#d9487e", "#ec6a4a"];
  const count = 13, pivot = { x: 330, y: 470 };
  const tiles = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    const size = 560 - t * 440;                 // 560 → 120
    const angle = -52 + t * 70;                 // fans from -52° to +18°
    const radius = size * 0.2;
    return { t, size, angle, radius, color: along(stops, t), x: pivot.x - size * 0.12, y: pivot.y - size * 0.92 };
  });
  return <svg className="fc-art fc-art-fan" viewBox="0 0 900 560" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <filter id="ffshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#05030f" floodOpacity=".55"/></filter>
      <filter id="ffgrain"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <linearGradient id="ffsheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".16"/><stop offset=".5" stopColor="#ffffff" stopOpacity="0"/></linearGradient>
    </defs>
    <g transform="translate(260 30)">
      {tiles.map((tile, i) => <g key={i} transform={`rotate(${tile.angle.toFixed(1)} ${pivot.x} ${pivot.y})`} filter="url(#ffshadow)">
        <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.radius} fill={tile.color}/>
        <rect x={tile.x} y={tile.y} width={tile.size} height={tile.size} rx={tile.radius} fill="url(#ffsheen)"/>
        <rect x={tile.x + 1} y={tile.y + 1} width={tile.size - 2} height={tile.size - 2} rx={tile.radius - 1} fill="none" stroke="#ffffff" strokeOpacity={0.06 + tile.t * 0.08} strokeWidth="2"/>
      </g>)}
      <g transform={`rotate(18 ${pivot.x} ${pivot.y})`}>
        <rect x={pivot.x - 120 * 0.12} y={pivot.y - 120 * 0.92} width="120" height="120" rx="24" filter="url(#ffgrain)"/>
      </g>
    </g>
  </svg>;
}
