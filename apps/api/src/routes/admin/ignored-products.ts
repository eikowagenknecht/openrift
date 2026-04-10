import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type { IgnoredProductResponse } from "@openrift/shared";
import { z } from "zod";

import type { Variables } from "../../types.js";
import { ignoreProductsSchema } from "./schemas.js";

// ── Route definitions ───────────────────────────────────────────────────────

const listIgnoredProducts = createRoute({
  method: "get",
  path: "/ignored-products",
  tags: ["Admin - Ignored Products"],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            products: z.array(
              z.object({
                marketplace: z.string().openapi({ example: "cardmarket" }),
                externalId: z.number().openapi({ example: 748_215 }),
                finish: z.string().openapi({ example: "foil" }),
                language: z.string().openapi({ example: "EN" }),
                productName: z.string().openapi({ example: "Jinx, Rebel (Foil)" }),
                createdAt: z.string().openapi({ example: "2026-04-01T10:00:00.000Z" }),
              }),
            ),
          }),
        },
      },
      description: "List ignored products",
    },
  },
});

const ignoreProducts = createRoute({
  method: "post",
  path: "/ignored-products",
  tags: ["Admin - Ignored Products"],
  request: {
    body: { content: { "application/json": { schema: ignoreProductsSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ ignored: z.number().openapi({ example: 12 }) }),
        },
      },
      description: "Products ignored",
    },
  },
});

const unignoreProducts = createRoute({
  method: "delete",
  path: "/ignored-products",
  tags: ["Admin - Ignored Products"],
  request: {
    body: { content: { "application/json": { schema: ignoreProductsSchema } } },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ unignored: z.number().openapi({ example: 12 }) }),
        },
      },
      description: "Products unignored",
    },
  },
});

// ── Route ───────────────────────────────────────────────────────────────────

export const ignoredProductsRoute = new OpenAPIHono<{ Variables: Variables }>()

  // ── GET /admin/ignored-products ─────────────────────────────────────────────

  .openapi(listIgnoredProducts, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const rows = await mktAdmin.listIgnoredProducts();

    return c.json({
      products: rows.map(
        (r): IgnoredProductResponse => ({
          marketplace: r.marketplace,
          externalId: r.externalId,
          finish: r.finish,
          language: r.language,
          productName: r.productName,
          createdAt: r.createdAt.toISOString(),
        }),
      ),
    });
  })

  // ── POST /admin/ignored-products ────────────────────────────────────────────

  .openapi(ignoreProducts, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, products } = c.req.valid("json");

    // Look up product names from staging
    const externalIds = products.map((p) => p.externalId);
    const stagingRows = await mktAdmin.getStagingProductNames(marketplace, externalIds);

    const nameMap = new Map<number, string>();
    for (const row of stagingRows) {
      if (!nameMap.has(row.externalId)) {
        nameMap.set(row.externalId, row.productName);
      }
    }

    // Insert into ignored products table (staging data is kept)
    const values = products
      .filter((p) => nameMap.has(p.externalId))
      .map((p) => ({
        marketplace,
        externalId: p.externalId,
        finish: p.finish,
        language: p.language,
        productName: nameMap.get(p.externalId) ?? "",
      }));

    if (values.length > 0) {
      await mktAdmin.insertIgnoredProducts(values);
    }

    return c.json({ ignored: values.length });
  })

  // ── DELETE /admin/ignored-products ──────────────────────────────────────────

  .openapi(unignoreProducts, async (c) => {
    const { marketplaceAdmin: mktAdmin } = c.get("repos");
    const { marketplace, products } = c.req.valid("json");

    const deleted = await mktAdmin.deleteIgnoredProducts(
      marketplace,
      products.map((p) => ({
        externalId: p.externalId,
        finish: p.finish,
        language: p.language,
      })),
    );

    return c.json({ unignored: deleted });
  });
