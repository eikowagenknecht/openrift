// Account-level contact methods (the channels a member reveals per friend group
// to arrange out-of-band trades — replaces the old per-group `nickname`).

/** The known contact channels. `in_person` and `other` carry free-text values. */
export const CONTACT_METHOD_TYPES = [
  "discord",
  "signal",
  "telegram",
  "whatsapp",
  "phone",
  "email",
  "in_person",
  "other",
] as const;

export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number];

/** One contact channel owned by a user (account-level, reusable across groups). */
export interface ContactMethod {
  id: string;
  type: ContactMethodType;
  value: string;
}

export interface UserContactMethodsResponse {
  items: ContactMethod[];
}
