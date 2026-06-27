import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { contactMethodSchema } from "@openrift/shared/response-schemas";
import { idParamSchema } from "@openrift/shared/schemas";
import { oc } from "@orpc/contract";
import { z } from "zod";

extendZodWithOpenApi(z);

export const contactMethodTypeSchema = z.enum([
  "discord",
  "signal",
  "telegram",
  "whatsapp",
  "phone",
  "email",
  "in_person",
  "other",
]);

export const createContactMethodSchema = z.object({
  type: contactMethodTypeSchema,
  value: z.string().trim().min(1).max(200),
});

export const reorderContactMethodsSchema = z.object({
  ids: z.array(z.uuid()),
});

export const userContactMethodsResponseSchema = z
  .object({
    items: z.array(contactMethodSchema),
  })
  .openapi("UserContactMethodsResponse");

/**
 * oRPC contract for the authenticated contact-methods CRUD. Every mutation
 * returns the full refreshed list. Requires a session (mount applies
 * `requireAuth`). For update/delete the `{id}` path segment is merged into the
 * input alongside the body fields; update/delete report a typed NOT_FOUND.
 */
export const contactMethodsContract = {
  list: oc
    .route({ method: "GET", path: "/api/v1/contact-methods", tags: ["Contact Methods"] })
    .output(userContactMethodsResponseSchema),
  create: oc
    .route({ method: "POST", path: "/api/v1/contact-methods", tags: ["Contact Methods"] })
    .input(createContactMethodSchema)
    .output(userContactMethodsResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/contact-methods/{id}", tags: ["Contact Methods"] })
    .input(createContactMethodSchema.extend(idParamSchema.shape))
    .errors({ NOT_FOUND: { message: "Contact method not found" } })
    .output(userContactMethodsResponseSchema),
  remove: oc
    .route({ method: "DELETE", path: "/api/v1/contact-methods/{id}", tags: ["Contact Methods"] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Contact method not found" } })
    .output(userContactMethodsResponseSchema),
  reorder: oc
    .route({ method: "POST", path: "/api/v1/contact-methods/reorder", tags: ["Contact Methods"] })
    .input(reorderContactMethodsSchema)
    .output(userContactMethodsResponseSchema),
};

export type ContactMethodsContract = typeof contactMethodsContract;
