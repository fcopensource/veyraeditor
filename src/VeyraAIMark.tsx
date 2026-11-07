import { useId } from "react";

/** The Veyra AI logo: one soft four-point spark with a small companion, in a calm blue-violet. Flat, no glow. */
export function VeyraAIMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return <svg className={"veyra-ai-mark " + className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#7da6f5" /><stop offset="1" stopColor="#a08cec" /></linearGradient></defs>
    <path d="M10.5 4.5c.55 4.6 3.05 7.1 7.75 7.75-4.7.65-7.2 3.15-7.75 7.75-.55-4.6-3.05-7.1-7.75-7.75 4.7-.65 7.2-3.15 7.75-7.75Z" fill={`url(#${id})`} />
    <path d="M18.6 2.4c.24 1.3 1 2.06 2.3 2.3-1.3.24-2.06 1-2.3 2.3-.24-1.3-1-2.06-2.3-2.3 1.3-.24 2.06-1 2.3-2.3Z" fill="#a08cec" opacity=".75" />
  </svg>;
}
