import { useEffect, useRef, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, Coffee, CreditCard, Heart, Lock, Repeat, X } from "lucide-react";
import { SUPPORT_LINKS, safeSupportUrl } from "./support";

type Option = { key: string; icon: ReactNode; title: string; text: string; by: string; url: string };

/** "Support Veyra": optional donations through Buy Me a Coffee or Stripe, opened in the browser. */
export function SupportDialog({ onClose, notify }: { onClose: () => void; notify: (message: string) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  const options: Option[] = [
    { key: "coffee", icon: <Coffee size={22}/>, title: "Buy me a coffee", text: "A quick one-time thank you.", by: "Buy Me a Coffee", url: SUPPORT_LINKS.buyMeACoffee },
    { key: "stripe", icon: <CreditCard size={22}/>, title: "Support with a card", text: "Any amount, by card, Apple Pay or Google Pay.", by: "Stripe", url: SUPPORT_LINKS.stripe },
    ...(SUPPORT_LINKS.stripeMonthly ? [{ key: "monthly", icon: <Repeat size={22}/>, title: "Support monthly", text: "Become a regular backer. Cancel anytime.", by: "Stripe", url: SUPPORT_LINKS.stripeMonthly }] : []),
  ];
  const open = (option: Option) => {
    const url = safeSupportUrl(option.url);
    if (!url) return;
    void openUrl(url).then(() => notify("Opened " + option.by + " in your browser. Thank you!")).catch(() => notify("Open " + url + " in your browser."));
  };
  return <div className="overlay support-overlay" onMouseDown={onClose} onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
    <section className="dialog support-dialog" role="dialog" aria-modal="true" aria-labelledby="support-title" onMouseDown={e => e.stopPropagation()}>
      <button className="support-close" aria-label="Close" onClick={onClose}><X size={16}/></button>
      <header>
        <span className="support-heart" aria-hidden="true"><Heart size={22}/></span>
        <small>FREE FOREVER · NO ADS · NO TRACKING</small>
        <h2 id="support-title">Support <em>Veyra Studio</em></h2>
        <p>Veyra is built by a small independent team. If it saves you time, a small contribution keeps it fast, free and improving.</p>
      </header>
      <div className="support-options">
        {options.map((option, i) => {
          const ready = !!safeSupportUrl(option.url);
          return <button key={option.key} ref={i === 0 ? first : undefined} className={"support-option " + option.key} disabled={!ready} onClick={() => open(option)}
            aria-label={option.title + (ready ? " (opens " + option.by + " in your browser)" : " (coming soon)")}>
            <span className="support-icon">{option.icon}</span>
            <span><b>{option.title}</b><small>{option.text}</small></span>
            {ready ? <em>{option.by}<ArrowUpRight size={13}/></em> : <em className="soon">Coming soon</em>}
          </button>;
        })}
      </div>
      <footer><Lock size={12}/>Payments open in your browser on the provider's secure page. Veyra never sees your card details.</footer>
    </section>
  </div>;
}
