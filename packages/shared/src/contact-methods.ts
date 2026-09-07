import type { ContactMethod, ContactMethodType } from "./types/api/contact-method.js";

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

/** Returns `""` when `methods` is empty, so callers can `&&`-guard the line. */
export function formatContactMethodsSummary(methods: ContactMethod[]): string {
  return methods
    .map((method) => `${CONTACT_METHOD_LABELS[method.type]}: ${method.value}`)
    .join(" · ");
}
