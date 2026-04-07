import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import type { Variables } from "../../types.js";

const enumRowSchema = z.object({
  slug: z.string(),
  label: z.string(),
  sortOrder: z.number(),
});

const enumsResponseSchema = z.record(z.string(), z.array(enumRowSchema));

const getEnums = createRoute({
  method: "get",
  path: "/enums",
  tags: ["Enums"],
  responses: {
    200: {
      content: { "application/json": { schema: enumsResponseSchema } },
      description: "All reference table enums",
    },
  },
});

/** Public: GET /enums — returns all reference table rows for building dropdowns. */
export const enumsRoute = new OpenAPIHono<{ Variables: Variables }>().openapi(
  getEnums,
  async (c) => {
    const { enums } = c.get("repos");
    const data = await enums.all();
    const stripped = Object.fromEntries(
      Object.entries(data).map(([key, rows]) => [
        key,
        rows.map(({ isWellKnown: _, ...rest }) => rest),
      ]),
    );
    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json(stripped);
  },
);
