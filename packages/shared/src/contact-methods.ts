import type { ContactMethod, ContactMethodType } from "./types/api/contact-method.js";

/** Human-readable channel names, shared by the web UI and transactional emails. */
export const CONTACT_METHOD_LABELS: Record<ContactMethodType, string> = {
  discord: "Discord",
  signal: "Signal",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",
  in_person: "In person",
  other: "Other",
};

/**
 * One-line plain-text summary of a member's revealed contact methods, e.g.
 * `"Discord: seb#1234 · Email: seb@example.com"`. Empty string when there are
 * none, so callers can `&&`-guard the line.
 * @returns The joined summary, or `""` when `methods` is empty.
 */
export function formatContactMethodsSummary(methods: ContactMethod[]): string {
  return methods
    .map((method) => `${CONTACT_METHOD_LABELS[method.type]}: ${method.value}`)
    .join(" · ");
}
