import type { userContactMethodsResponseSchema } from "@openrift/shared/contracts/contact-methods";
import type { contactMethodSchema } from "@openrift/shared/response-schemas";
import type { z } from "zod";

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

export type ContactMethod = z.infer<typeof contactMethodSchema>;

export type UserContactMethodsResponse = z.infer<typeof userContactMethodsResponseSchema>;
