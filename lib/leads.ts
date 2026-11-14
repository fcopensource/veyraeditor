/* Project enquiries for FlightCoders: what the form may contain, and checking it. Shared by the form and the API. */

export const SERVICES = [
  "VS Code or JetBrains extension",
  "Desktop app (Windows, macOS, Linux)",
  "Web app or website",
  "Browser extension (Chrome, Edge, Firefox)",
  "Salesforce development",
  "Something else",
] as const;
export const BUDGETS = ["Under $1,000", "$1,000 – $5,000", "$5,000 – $15,000", "$15,000+", "Not sure yet"] as const;
export const TIMELINES = ["As soon as possible", "Within a month", "1–3 months", "Just exploring"] as const;

export interface Lead { name: string; email: string; company: string; service: string; budget: string; timeline: string; message: string; source: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\u0000/g, "").trim().slice(0, max) : "";

/** Checks a submitted form. Returns the cleaned lead, or the first problem to show next to the form. */
export function validateLead(input: Record<string, unknown>): { lead: Lead } | { error: string; field: string } {
  const lead: Lead = {
    name: clean(input.name, 100), email: clean(input.email, 254).toLowerCase(), company: clean(input.company, 120),
    service: clean(input.service, 60), budget: clean(input.budget, 40), timeline: clean(input.timeline, 40),
    message: clean(input.message, 5000), source: clean(input.source, 200),
  };
  if (lead.name.length < 2) return { error: "Please tell us your name.", field: "name" };
  if (!EMAIL.test(lead.email)) return { error: "Please enter an email address we can reply to.", field: "email" };
  if (!(SERVICES as readonly string[]).includes(lead.service)) return { error: "Please choose what you'd like us to build.", field: "service" };
  if (lead.budget && !(BUDGETS as readonly string[]).includes(lead.budget)) return { error: "Please choose a budget from the list.", field: "budget" };
  if (lead.timeline && !(TIMELINES as readonly string[]).includes(lead.timeline)) return { error: "Please choose a timeline from the list.", field: "timeline" };
  if (lead.message.length < 20) return { error: "Please describe your project in a sentence or two (at least 20 characters).", field: "message" };
  return { lead };
}
