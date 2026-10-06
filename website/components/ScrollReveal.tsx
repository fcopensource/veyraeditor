"use client";
import { useEffect } from "react";

/** Adds `.revealed` to every `[data-reveal]` element as it scrolls into view (once). */
export function ScrollReveal() {
  useEffect(() => {
    const items = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      items.forEach(item => item.classList.add("revealed"));
      return;
    }
    document.documentElement.classList.add("reveal-ready");
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("revealed"); io.unobserve(entry.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    items.forEach(item => io.observe(item));
    return () => io.disconnect();
  }, []);
  return null;
}
