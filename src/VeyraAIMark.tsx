import logo from "./assets/veyra-ai.svg";

/** The Veyra AI logo: a faceted 3D gem. CSS (studio.css, .veyra-ai-mark) adds depth, hover tilt and motion. */
export function VeyraAIMark({ size = 16, className = "" }: { size?: number; className?: string }) {
  return <img className={"veyra-ai-mark " + className} src={logo} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}
