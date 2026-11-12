/**
 * Where "Support Veyra" sends people. Veyra Studio is free; these are optional donations.
 * Every payment happens on the provider's own secure page in the browser: Veyra never sees card details.
 *
 * - buyMeACoffee: your page, e.g. https://buymeacoffee.com/<your-username>
 * - stripe: a Stripe Payment Link (Stripe Dashboard → Payment Links → New), e.g. https://buy.stripe.com/<id>.
 *   Tip: choose "Customers choose what to pay" so supporters can pick any amount.
 * - stripeMonthly (optional): a second Payment Link for a recurring monthly price.
 *
 * A link left empty shows that option as "coming soon" instead of a broken button.
 */
export const SUPPORT_LINKS = {
  buyMeACoffee: "",
  stripe: "",
  stripeMonthly: "",
};

/** Only https links to the expected providers are ever opened. */
export function safeSupportUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    const allowed = ["buymeacoffee.com", "www.buymeacoffee.com", "buy.stripe.com", "checkout.stripe.com", "donate.stripe.com"];
    return allowed.includes(host) ? parsed.toString() : null;
  } catch { return null; }
}
