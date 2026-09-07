import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { contactMethodSchema } from "@openrift/shared/response-schemas";
import { idParamSchema } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";

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
  ids: z.array(z.uuid()).max(500),
});

export const userContactMethodsResponseSchema = z
  .object({
    items: z.array(contactMethodSchema),
  })
  .openapi("UserContactMethodsResponse");

export const contactMethodsContract = {
  list: authedRoute
    .route({ method: "GET", path: "/api/v1/contact-methods", tags: ["Contact Methods"] })
    .output(userContactMethodsResponseSchema),
  create: authedRoute
    .route({ method: "POST", path: "/api/v1/contact-methods", tags: ["Contact Methods"] })
    .input(createContactMethodSchema)
    .output(userContactMethodsResponseSchema),
  update: authedRoute
    .route({ method: "PATCH", path: "/api/v1/contact-methods/{id}", tags: ["Contact Methods"] })
    .input(createContactMethodSchema.extend(idParamSchema.shape))
    .errors({ NOT_FOUND: { message: "Contact method not found" } })
    .output(userContactMethodsResponseSchema),
  remove: authedRoute
    .route({ method: "DELETE", path: "/api/v1/contact-methods/{id}", tags: ["Contact Methods"] })
    .input(idParamSchema)
    .errors({ NOT_FOUND: { message: "Contact method not found" } })
    .output(userContactMethodsResponseSchema),
  reorder: authedRoute
    .route({ method: "POST", path: "/api/v1/contact-methods/reorder", tags: ["Contact Methods"] })
    .input(reorderContactMethodsSchema)
    .output(userContactMethodsResponseSchema),
};

export type ContactMethodsContract = typeof contactMethodsContract;
