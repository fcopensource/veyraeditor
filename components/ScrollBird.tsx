"use client";
import { useEffect, useRef } from "react";

/* Veyra's hummingbird, flying down the page as you scroll: it glides from the top of the window to the bottom as you
   read, sways a little, dips its nose when you scroll down and lifts it when you scroll back up. Purely decorative:
   it ignores the pointer, is hidden from screen readers, and holds still when the system asks for reduced motion. */
export function ScrollBird() {
  const bird = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bird.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let y = 0, x = 0, tilt = 0, lastScroll = window.scrollY, frame = 0, settle = 0;
    const target = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      const size = el.offsetHeight || 80;
      const top = 90, bottom = window.innerHeight - size - 24;
      return { y: top + progress * Math.max(0, bottom - top), x: Math.sin(progress * Math.PI * 5) * 26, progress };
    };
    const place = () => {
      const t = target();
      if (still.matches) { y = t.y; x = 0; tilt = 0; }
      else {
        const velocity = window.scrollY - lastScroll;
        lastScroll = window.scrollY;
        y += (t.y - y) * 0.12; x += (t.x - x) * 0.1;
        const wanted = Math.max(-28, Math.min(32, velocity * 1.4)); // nose down when diving, up when climbing
        tilt += (wanted - tilt) * 0.15;
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
      el.classList.toggle("diving", tilt > 8);
      el.classList.toggle("landed", t.progress > 0.985);
      if (!still.matches && (Math.abs(t.y - y) > 0.3 || Math.abs(tilt) > 0.3 || Math.abs(t.x - x) > 0.3)) frame = requestAnimationFrame(place);
      else frame = 0;
    };
    const run = () => { if (!frame) frame = requestAnimationFrame(place); };
    // Fly while scrolling, then one last glide after scrolling stops (the tilt eases back to level), then rest.
    const wake = () => { run(); clearTimeout(settle); settle = window.setTimeout(run, 150); };
    const first = target(); y = first.y; x = first.x;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    el.classList.add("ready");
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake);
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); window.removeEventListener("scroll", wake); window.removeEventListener("resize", wake); };
  }, []);

  return <div className="scroll-bird" ref={bird} aria-hidden="true">
    <svg viewBox="96 74 352 388" width="100%" height="100%">
      <defs>
        <linearGradient id="sbWingL" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#4c3be0"/><stop offset="1" stopColor="#8f7dff"/></linearGradient>
        <linearGradient id="sbWingR" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#3a2bc4"/><stop offset="1" stopColor="#6d5cf6"/></linearGradient>
        <linearGradient id="sbBody" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#241a7a"/><stop offset=".55" stopColor="#4a38d6"/><stop offset="1" stopColor="#6d5cf6"/></linearGradient>
        <linearGradient id="sbThroat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7cf5b6"/><stop offset=".5" stopColor="#3ddc84"/><stop offset="1" stopColor="#14a6a0"/></linearGradient>
        <linearGradient id="sbBeak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8f7dff"/><stop offset="1" stopColor="#c9c1ff"/></linearGradient>
      </defs>
      <g className="sb-wing sb-left">
        <path d="M244 270 C 214 214, 172 156, 118 104 C 170 118, 232 176, 276 252 Z" fill="url(#sbWingL)"/>
        <path d="M250 262 C 228 222, 196 182, 150 138 C 196 158, 238 202, 266 252 Z" fill="#ffffff" opacity=".12"/>
      </g>
      <g className="sb-wing sb-right">
        <path d="M262 262 C 270 198, 296 142, 346 88 C 334 152, 314 214, 292 270 Z" fill="url(#sbWingR)"/>
        <path d="M270 252 C 280 204, 298 162, 328 122 C 318 166, 304 210, 288 256 Z" fill="#ffffff" opacity=".16"/>
      </g>
      <path d="M340 230 C 342 202, 312 194, 288 206 C 258 222, 236 250, 218 288 C 200 326, 180 356, 154 394 L 132 438 L 172 410 L 170 452 L 198 392 C 240 362, 282 330, 310 298 C 328 276, 340 254, 340 230 Z" fill="url(#sbBody)"/>
      <path d="M340 230 C 342 202, 312 194, 288 206 C 258 222, 236 250, 218 288 C 244 262, 280 238, 340 230 Z" fill="#ffffff" opacity=".12"/>
      <path d="M338 240 C 334 262, 318 282, 296 296 C 300 278, 306 262, 316 248 C 322 244, 330 240, 338 240 Z" fill="url(#sbThroat)"/>
      <path d="M338 240 C 330 246, 322 254, 316 264 C 326 258, 334 250, 338 240 Z" fill="#d8ffe9" opacity=".7"/>
      <circle cx="316" cy="226" r="7" fill="#0c0a2a"/>
      <circle cx="318.5" cy="223.5" r="2.4" fill="#ffffff"/>
      <path d="M336 222 L 438 214 L 338 238 Z" fill="url(#sbBeak)"/>
    </svg>
    <i className="sb-trail" />
  </div>;
}
