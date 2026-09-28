import type { ReactNode } from 'react';

export type PrismTone = 'violet' | 'cyan' | 'coral' | 'gold' | 'mint' | 'blue';

export function PrismIcon({ children, tone = 'violet', size = 'medium' }: { children: ReactNode; tone?: PrismTone; size?: 'small' | 'medium' | 'large' }) {
  return <span className={`prism-icon prism-${tone} prism-${size}`} aria-hidden="true">
    <span className="prism-glow" />
    <span className="prism-face">{children}</span>
  </span>;
}
