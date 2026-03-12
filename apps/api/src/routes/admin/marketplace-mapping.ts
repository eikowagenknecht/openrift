import type { Hono } from "hono";
import { z } from "zod/v4";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { requireAdmin } from "../../middleware/require-admin.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import {
  getMappingOverview,
  saveMappings,
  unmapAll,
  unmapPrinting,
} from "../../services/marketplace-mapping.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import type { MarketplaceConfig } from "./marketplace-configs.js";

// ── Route factory ───────────────────────────────────────────────────────────

export function createMappingRoutes(
  app: Hono<{ Variables: Variables }>,
  path: string,
  config: MarketplaceConfig,
) {
  app.use(path, requireAdmin);
  app.use(`${path}/all`, requireAdmin);

  // ── GET — build mapping overview ────────────────────────────────────────

  app.get(path, async (c) => {
    const showAll = c.req.query("all") === "true";
    const result = await getMappingOverview(db, config, { showAll });
    return c.json(result);
  });

  // ── POST — save mappings ──────────────────────────────────────────────────

  const saveMappingsSchema = z.object({
    mappings: z.array(
      z.object({
        printingId: z.string(),
        externalId: z.number(),
      }),
    ),
  });

  app.post(path, async (c) => {
    const { mappings } = saveMappingsSchema.parse(await c.req.json());
    const result = await saveMappings(db, config, mappings);
    return c.json(result);
  });

  // ── DELETE — unmap a printing, return to staging ──────────────────────────

  const unmapSchema = z.object({
    printingId: z.string(),
  });

  app.delete(path, async (c) => {
    const { printingId } = unmapSchema.parse(await c.req.json());
    await unmapPrinting(db, config, printingId);
    return c.json({ ok: true });
  });

  // ── DELETE /all — unmap every printing, return all to staging ──────────

  app.delete(`${path}/all`, async (c) => {
    const result = await unmapAll(db, config);
    return c.json({ ok: true, unmapped: result.unmapped });
  });
}
