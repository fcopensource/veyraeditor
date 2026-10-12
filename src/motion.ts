/* Shared motion for the workbench: side panels slide open and closed, panel contents ease in.
   Uses the Web Animations API, so nothing re-renders and panels keep their state. Honours reduced motion. */

export const EASE = "cubic-bezier(.2,.8,.2,1)";
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const canAnimate = (el: Element | null): el is HTMLElement => !!el && typeof (el as HTMLElement).animate === "function" && !reducedMotion();

/** Opens or closes a side panel smoothly: its width grows or shrinks, or it slides when it floats over the editor. */
export async function animatePanel(el: HTMLElement | null, open: boolean, side: "left" | "right", duration = 210) {
  if (!canAnimate(el)) return;
  // A new open/close replaces one still running (and the collapsed state a finished close holds),
  // before measuring, so the panel's real width is used.
  el.getAnimations().forEach(animation => animation.cancel());
  const floating = getComputedStyle(el).position === "absolute";
  const width = el.getBoundingClientRect().width;
  const frames: Keyframe[] = floating
    ? [{ transform: `translateX(${side === "left" ? "-" : ""}105%)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }]
    : [{ width: "0px", minWidth: "0px", opacity: 0 }, { width: `${width}px`, minWidth: "0px", opacity: 1 }];
  el.classList.add("panel-animating");
  // Closing holds its collapsed end state until the panel is removed or hidden, so it never flashes back open.
  const animation = el.animate(open ? frames : [...frames].reverse(), { duration, easing: open ? EASE : "cubic-bezier(.4,0,.6,1)", fill: open ? "none" : "forwards" });
  try { await animation.finished; } catch { /* cancelled: the panel changed again */ } finally { el.classList.remove("panel-animating"); }
}

/** Eases new panel content in: a short fade and slide, without remounting anything. */
export function revealChildren(container: HTMLElement | null, selector = ":scope > *", from = "translateX(-8px)") {
  if (!canAnimate(container)) return;
  container.querySelectorAll<HTMLElement>(selector).forEach((child, index) => {
    child.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], { duration: 200, delay: Math.min(index, 3) * 25, easing: EASE, fill: "backwards" });
  });
}
