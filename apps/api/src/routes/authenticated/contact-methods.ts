import { createRoute, z } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import { userContactMethodsResponseSchema } from "@openrift/shared/response-schemas";
import { createContactMethodSchema, reorderContactMethodsSchema } from "@openrift/shared/schemas";

import { AppError } from "../../errors.js";
import { getUserId } from "../../middleware/get-user-id.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { cookieAuth, errorResponses } from "../../openapi-helpers.js";
import { createApiApp } from "../../openapi.js";

const contactMethodIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: "id", in: "path" } }),
});

const listContactMethods = createRoute({
  method: "get",
  path: "/",
  tags: ["Contact Methods"],
  security: cookieAuth,
  responses: {
    200: {
      content: { "application/json": { schema: userContactMethodsResponseSchema } },
      description: "Success",
    },
    ...errorResponses(401),
  },
});

const createContactMethod = createRoute({
  method: "post",
  path: "/",
  tags: ["Contact Methods"],
  security: cookieAuth,
  request: {
    body: {
      content: { "application/json": { schema: createContactMethodSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userContactMethodsResponseSchema } },
      description: "Success",
    },
    ...errorResponses(400, 401),
  },
});

const updateContactMethod = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["Contact Methods"],
  security: cookieAuth,
  request: {
    params: contactMethodIdParamSchema,
    body: {
      content: { "application/json": { schema: createContactMethodSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userContactMethodsResponseSchema } },
      description: "Success",
    },
    ...errorResponses(400, 401, 404),
  },
});

const deleteContactMethod = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["Contact Methods"],
  security: cookieAuth,
  request: { params: contactMethodIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: userContactMethodsResponseSchema } },
      description: "Success",
    },
    ...errorResponses(401, 404),
  },
});

const reorderContactMethods = createRoute({
  method: "post",
  path: "/reorder",
  tags: ["Contact Methods"],
  security: cookieAuth,
  request: {
    body: {
      content: { "application/json": { schema: reorderContactMethodsSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: userContactMethodsResponseSchema } },
      description: "Success",
    },
    ...errorResponses(400, 401),
  },
});

const contactMethodsApp = createApiApp().basePath("/contact-methods");
contactMethodsApp.use(requireAuth);

export const contactMethodsRoute = contactMethodsApp
  .openapi(listContactMethods, async (c) => {
    const { userContactMethods } = c.get("repos");
    const items = await userContactMethods.listForUser(getUserId(c));
    return c.json({ items }, 200);
  })

  .openapi(createContactMethod, async (c) => {
    const { userContactMethods } = c.get("repos");
    const userId = getUserId(c);
    const { type, value } = c.req.valid("json");
    await userContactMethods.create(userId, type, value);
    const items = await userContactMethods.listForUser(userId);
    return c.json({ items }, 200);
  })

  .openapi(updateContactMethod, async (c) => {
    const { userContactMethods } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const { type, value } = c.req.valid("json");
    const updated = await userContactMethods.update(id, userId, type, value);
    if (updated === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Contact method not found");
    }
    const items = await userContactMethods.listForUser(userId);
    return c.json({ items }, 200);
  })

  .openapi(deleteContactMethod, async (c) => {
    const { userContactMethods } = c.get("repos");
    const userId = getUserId(c);
    const { id } = c.req.valid("param");
    const deleted = await userContactMethods.delete(id, userId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Contact method not found");
    }
    const items = await userContactMethods.listForUser(userId);
    return c.json({ items }, 200);
  })

  .openapi(reorderContactMethods, async (c) => {
    const { userContactMethods } = c.get("repos");
    const userId = getUserId(c);
    const { ids } = c.req.valid("json");
    await userContactMethods.reorder(userId, ids);
    const items = await userContactMethods.listForUser(userId);
    return c.json({ items }, 200);
  });
