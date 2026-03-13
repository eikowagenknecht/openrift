// oxlint-disable-next-line import/no-nodejs-modules -- server-side file needs filesystem path join
import { join } from "node:path";

import {
  acceptNewCardFromSources,
  insertPrintingImage,
  linkUnmatchedSources,
  upsertSet,
} from "@openrift/shared/services/card-source-helpers";
import { extractKeywords } from "@openrift/shared/services/extract-keywords";
import { ingestCardSources } from "@openrift/shared/services/ingest-card-sources";
import type { Rarity } from "@openrift/shared/types";
import { buildPrintingId } from "@openrift/shared/utils";
import { Hono } from "hono";
import type { SqlBool } from "kysely";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import {
  CARD_IMAGES_DIR,
  deleteRehostFiles,
  downloadImage,
  printingIdToFileBase,
  processAndSave,
  renameRehostFiles,
} from "../services/image-rehost.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

export const cardSourcesRoute = new Hono<{ Variables: Variables }>();

// ── GET /card-sources/all-cards ──────────────────────────────────────────────
// Lightweight list of all cards for client-side search (link combobox etc.)
cardSourcesRoute.get("/card-sources/all-cards", async (c) => {
  const rows = await db
    .selectFrom("cards")
    .select(["id", "name", "type"])
    .orderBy("name")
    .execute();

  return c.json(rows.map((r) => ({ id: r.id, name: r.name, type: r.type })));
});

// ── GET /card-sources/source-names ────────────────────────────────────────────
// List distinct source names for the combobox on the upload page
cardSourcesRoute.get("/card-sources/source-names", async (c) => {
  const rows = await db
    .selectFrom("card_sources")
    .select("source")
    .distinct()
    .orderBy("source")
    .execute();

  return c.json(rows.map((r) => r.source));
});

// ── GET /card-sources/source-stats ─────────────────────────────────────────────
// Per-source card and printing counts
cardSourcesRoute.get("/card-sources/source-stats", async (c) => {
  const rows = await db
    .selectFrom("card_sources as cs")
    .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
    .select([
      "cs.source",
      sql<number>`count(DISTINCT cs.name)`.as("cardCount"),
      sql<number>`count(DISTINCT ps.id)`.as("printingCount"),
      sql<string>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
        "lastUpdated",
      ),
    ])
    .groupBy("cs.source")
    .orderBy("cs.source")
    .execute();

  return c.json(
    rows.map((r) => ({
      source: r.source,
      cardCount: Number(r.cardCount),
      printingCount: Number(r.printingCount),
      lastUpdated: r.lastUpdated,
    })),
  );
});

// ── GET /card-sources ─────────────────────────────────────────────────────────
// List all cards + unmatched groups with source/unchecked counts
cardSourcesRoute.get("/card-sources", async (c) => {
  const filter = c.req.query("filter") ?? "all";
  const source = c.req.query("source");

  // Get summaries grouped by card_id (matched) or name (unmatched)
  let query = db
    .selectFrom("card_sources as cs")
    .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
    // raw sql: could use fn.count(eb.case()...).distinct() but the sql`` form is
    // much more readable for these multi-condition conditional aggregates
    .select([
      sql<string | null>`max(cs.card_id)`.as("card_id"),
      sql<string>`min(cs.name)`.as("name"),
      sql<number>`count(DISTINCT cs.id)`.as("sourceCount"),
      sql<number>`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END)`.as(
        "uncheckedCardCount",
      ),
      sql<number>`count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`.as(
        "uncheckedPrintingCount",
      ),
      sql<boolean>`bool_or(cs.source = 'gallery')`.as("hasGallery"),
    ])
    .groupBy(sql`COALESCE(cs.card_id, cs.name)`);

  if (source) {
    // Only include cards that have at least one card_source from this source.
    // Match by card_id when available (matched cards may have different name spellings),
    // fall back to name match for unmatched cards.
    query = query.where((eb) =>
      eb.exists(
        eb
          .selectFrom("card_sources as cs2")
          .select(sql.lit(1).as("x"))
          .where("cs2.source", "=", source)
          .where(sql<SqlBool>`COALESCE(cs2.card_id, cs2.name) = COALESCE(cs.card_id, cs.name)`),
      ),
    );
  }

  if (filter === "unchecked") {
    // raw sql: arithmetic on two conditional aggregates in HAVING — clearer as raw sql
    query = query.having(
      sql`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END) +
          count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`,
      ">",
      0,
    );
  } else if (filter === "unmatched") {
    query = query.where("cs.card_id", "is", null);
  }

  const rows = await query.orderBy(sql`min(cs.name)`).execute();

  return c.json(
    rows.map((r) => ({
      cardId: r.card_id,
      name: r.name,
      sourceCount: Number(r.sourceCount),
      uncheckedCardCount: Number(r.uncheckedCardCount),
      uncheckedPrintingCount: Number(r.uncheckedPrintingCount),
      hasGallery: Boolean(r.hasGallery),
    })),
  );
});

// ── GET /card-sources/export ──────────────────────────────────────────────────
// Export all active cards + printings in the same JSON format the upload endpoint accepts
cardSourcesRoute.get("/card-sources/export", async (c) => {
  const cards = await db.selectFrom("cards").selectAll().orderBy("name").execute();

  const printings = await db
    .selectFrom("printings")
    .innerJoin("sets", "sets.id", "printings.set_id")
    .leftJoin("printing_images", (jb) =>
      jb
        .onRef("printing_images.printing_id", "=", "printings.id")
        .on("printing_images.face", "=", "front")
        .on("printing_images.is_active", "=", true),
    )
    .selectAll("printings")
    .select([
      "sets.name as set_name",
      "printing_images.rehosted_url",
      "printing_images.original_url",
    ])
    .execute();

  const printingsByCardId = new Map<string, typeof printings>();
  for (const p of printings) {
    const list = printingsByCardId.get(p.card_id) ?? [];
    list.push(p);
    printingsByCardId.set(p.card_id, list);
  }

  const candidates = cards.map((card) => ({
    card: {
      name: card.name,
      type: card.type,
      super_types: card.super_types,
      domains: card.domains,
      might: card.might,
      energy: card.energy,
      power: card.power,
      might_bonus: card.might_bonus,
      rules_text: card.rules_text ?? "",
      effect_text: card.effect_text ?? "",
      tags: card.tags,
      source_id: card.id,
      source_entity_id: null,
      extra_data: null,
    },
    printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
      source_id: p.source_id,
      set_id: p.set_id,
      set_name: p.set_name,
      collector_number: p.collector_number,
      rarity: p.rarity,
      art_variant: p.art_variant,
      is_signed: p.is_signed,
      is_promo: p.is_promo,
      finish: p.finish,
      artist: p.artist,
      public_code: p.public_code,
      printed_rules_text: p.printed_rules_text,
      printed_effect_text: p.printed_effect_text,
      image_url: p.original_url ?? p.rehosted_url ?? null,
      flavor_text: p.flavor_text,
      extra_data: null,
    })),
  }));

  return c.json(candidates);
});

// ── GET /card-sources/:cardId ────────────────────────────────────────────────
// Detail: active card + all card_sources + printings + printing_sources
cardSourcesRoute.get("/card-sources/:cardId", async (c) => {
  const { cardId } = c.req.param();

  const card = await db.selectFrom("cards").selectAll().where("id", "=", cardId).executeTakeFirst();

  if (!card) {
    throw new AppError(404, "NOT_FOUND", "Card not found");
  }

  const sources = await db
    .selectFrom("card_sources")
    .selectAll()
    .where("card_id", "=", cardId)
    .orderBy("source")
    .execute();

  const printings = await db
    .selectFrom("printings")
    .selectAll()
    .where("card_id", "=", cardId)
    .execute();

  const sourceIds = sources.map((s) => s.id);
  const printingSources =
    sourceIds.length > 0
      ? await db
          .selectFrom("printing_sources")
          .selectAll()
          .where("card_source_id", "in", sourceIds)
          .execute()
      : [];

  const printingIds = printings.map((p) => p.id);
  const printingImages =
    printingIds.length > 0
      ? await db
          .selectFrom("printing_images")
          .selectAll()
          .where("printing_id", "in", printingIds)
          .orderBy("created_at", "asc")
          .execute()
      : [];

  return c.json({
    card: {
      id: card.id,
      name: card.name,
      type: card.type,
      superTypes: card.super_types,
      domains: card.domains,
      might: card.might,
      energy: card.energy,
      power: card.power,
      mightBonus: card.might_bonus,
      keywords: card.keywords,
      rulesText: card.rules_text,
      effectText: card.effect_text,
      tags: card.tags,
    },
    sources: sources.map((s) => ({
      id: s.id,
      cardId: s.card_id,
      source: s.source,
      name: s.name,
      type: s.type,
      superTypes: s.super_types,
      domains: s.domains,
      might: s.might,
      energy: s.energy,
      power: s.power,
      mightBonus: s.might_bonus,
      keywords: [...extractKeywords(s.rules_text ?? ""), ...extractKeywords(s.effect_text)].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
      rulesText: s.rules_text,
      effectText: s.effect_text,
      tags: s.tags,
      sourceId: s.source_id,
      sourceEntityId: s.source_entity_id,
      extraData: s.extra_data,
      checkedAt: s.checked_at?.toISOString() ?? null,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
    })),
    printings: printings.map((p) => ({
      id: p.id,
      cardId: p.card_id,
      setId: p.set_id,
      sourceId: p.source_id,
      collectorNumber: p.collector_number,
      rarity: p.rarity,
      artVariant: p.art_variant,
      isSigned: p.is_signed,
      isPromo: p.is_promo,
      finish: p.finish,
      artist: p.artist,
      publicCode: p.public_code,
      printedRulesText: p.printed_rules_text,
      printedEffectText: p.printed_effect_text,
      flavorText: p.flavor_text,
    })),
    printingSources: printingSources.map((ps) => ({
      id: ps.id,
      cardSourceId: ps.card_source_id,
      printingId: ps.printing_id,
      sourceId: ps.source_id,
      setId: ps.set_id,
      setName: ps.set_name,
      collectorNumber: ps.collector_number,
      rarity: ps.rarity,
      artVariant: ps.art_variant,
      isSigned: ps.is_signed,
      isPromo: ps.is_promo,
      finish: ps.finish,
      artist: ps.artist,
      publicCode: ps.public_code,
      printedRulesText: ps.printed_rules_text,
      printedEffectText: ps.printed_effect_text,
      imageUrl: ps.image_url,
      flavorText: ps.flavor_text,
      extraData: ps.extra_data,
      checkedAt: ps.checked_at?.toISOString() ?? null,
      createdAt: ps.created_at.toISOString(),
      updatedAt: ps.updated_at.toISOString(),
    })),
    printingImages: printingImages.map((pi) => ({
      id: pi.id,
      printingId: pi.printing_id,
      face: pi.face,
      source: pi.source,
      originalUrl: pi.original_url,
      rehostedUrl: pi.rehosted_url,
      isActive: pi.is_active,
      createdAt: pi.created_at.toISOString(),
      updatedAt: pi.updated_at.toISOString(),
    })),
  });
});

// ── GET /card-sources/new/:name ──────────────────────────────────────────────
// Unmatched detail: card_sources where card_id IS NULL grouped by name
cardSourcesRoute.get("/card-sources/new/:name", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));

  const sources = await db
    .selectFrom("card_sources")
    .selectAll()
    .where("name", "=", name)
    .where("card_id", "is", null)
    .orderBy("source")
    .execute();

  if (sources.length === 0) {
    throw new AppError(404, "NOT_FOUND", "No unmatched sources found for this name");
  }

  const sourceIds = sources.map((s) => s.id);
  const printingSources = await db
    .selectFrom("printing_sources")
    .selectAll()
    .where("card_source_id", "in", sourceIds)
    .execute();

  return c.json({
    name,
    sources: sources.map((s) => ({
      id: s.id,
      cardId: s.card_id,
      source: s.source,
      name: s.name,
      type: s.type,
      superTypes: s.super_types,
      domains: s.domains,
      might: s.might,
      energy: s.energy,
      power: s.power,
      mightBonus: s.might_bonus,
      keywords: [...extractKeywords(s.rules_text ?? ""), ...extractKeywords(s.effect_text)].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
      rulesText: s.rules_text,
      effectText: s.effect_text,
      tags: s.tags,
      sourceId: s.source_id,
      sourceEntityId: s.source_entity_id,
      extraData: s.extra_data,
      checkedAt: s.checked_at?.toISOString() ?? null,
      createdAt: s.created_at.toISOString(),
      updatedAt: s.updated_at.toISOString(),
    })),
    printingSources: printingSources.map((ps) => ({
      id: ps.id,
      cardSourceId: ps.card_source_id,
      printingId: ps.printing_id,
      sourceId: ps.source_id,
      setId: ps.set_id,
      setName: ps.set_name,
      collectorNumber: ps.collector_number,
      rarity: ps.rarity,
      artVariant: ps.art_variant,
      isSigned: ps.is_signed,
      isPromo: ps.is_promo,
      finish: ps.finish,
      artist: ps.artist,
      publicCode: ps.public_code,
      printedRulesText: ps.printed_rules_text,
      printedEffectText: ps.printed_effect_text,
      imageUrl: ps.image_url,
      flavorText: ps.flavor_text,
      extraData: ps.extra_data,
      checkedAt: ps.checked_at?.toISOString() ?? null,
      createdAt: ps.created_at.toISOString(),
      updatedAt: ps.updated_at.toISOString(),
    })),
  });
});

// ── POST /card-sources/:cardSourceId/check ──────────────────────────────────
cardSourcesRoute.post("/card-sources/:cardSourceId/check", async (c) => {
  const { cardSourceId } = c.req.param();

  const result = await db
    .updateTable("card_sources")
    .set({ checked_at: new Date(), updated_at: new Date() })
    .where("id", "=", cardSourceId)
    .executeTakeFirst();

  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Card source not found");
  }

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-sources/check-all ───────────────────────────
// Mark all printing_sources for a given printing as checked
// NOTE: Must be registered before /card-sources/:cardId/check-all to avoid
// the :cardId wildcard matching "printing-sources" as a card ID.
cardSourcesRoute.post("/card-sources/printing-sources/check-all", async (c) => {
  const { printingId } = await c.req.json<{ printingId: string }>();

  const results = await db
    .updateTable("printing_sources")
    .set({ checked_at: new Date(), updated_at: new Date() })
    .where("printing_id", "=", printingId)
    .where("checked_at", "is", null)
    .execute();

  const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
  return c.json({ ok: true, updated });
});

// ── POST /card-sources/printing-sources/:id/check ───────────────────────────
cardSourcesRoute.post("/card-sources/printing-sources/:id/check", async (c) => {
  const { id } = c.req.param();

  const result = await db
    .updateTable("printing_sources")
    .set({ checked_at: new Date(), updated_at: new Date() })
    .where("id", "=", id)
    .executeTakeFirst();

  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  return c.json({ ok: true });
});

// ── POST /card-sources/:cardId/check-all ────────────────────────────────────
// Mark all card_sources for a given card as checked
cardSourcesRoute.post("/card-sources/:cardId/check-all", async (c) => {
  const { cardId } = c.req.param();

  const results = await db
    .updateTable("card_sources")
    .set({ checked_at: new Date(), updated_at: new Date() })
    .where("card_id", "=", cardId)
    .where("checked_at", "is", null)
    .execute();

  const updated = results.reduce((sum, r) => sum + Number(r.numUpdatedRows), 0);
  return c.json({ ok: true, updated });
});

// ── PATCH /card-sources/printing-sources/:id ─────────────────────────────────
// Update differentiator fields on a printing_source (e.g. fix wrong art_variant)
cardSourcesRoute.patch("/card-sources/printing-sources/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const allowedFields: Record<string, string> = {
    artVariant: "art_variant",
    isSigned: "is_signed",
    isPromo: "is_promo",
    finish: "finish",
    collectorNumber: "collector_number",
    setId: "set_id",
    sourceId: "source_id",
    rarity: "rarity",
  };

  const updates: Record<string, unknown> = { updated_at: new Date() };
  for (const [camel, col] of Object.entries(allowedFields)) {
    if (camel in body) {
      updates[col] = body[camel];
    }
  }

  if (Object.keys(updates).length === 1) {
    throw new AppError(400, "BAD_REQUEST", "No valid fields to update");
  }

  const result = await db
    .updateTable("printing_sources")
    .set(updates)
    .where("id", "=", id)
    .executeTakeFirst();

  if (!result || result.numUpdatedRows === 0n) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  return c.json({ ok: true });
});

// ── DELETE /card-sources/printing-sources/:id ─────────────────────────────────
cardSourcesRoute.delete("/card-sources/printing-sources/:id", async (c) => {
  const { id } = c.req.param();

  const result = await db.deleteFrom("printing_sources").where("id", "=", id).execute();

  if (Number(result[0].numDeletedRows) === 0) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-sources/:id/copy ─────────────────────────────
// Duplicate a printing_source and link the copy to a different printing
cardSourcesRoute.post("/card-sources/printing-sources/:id/copy", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const { printingId } = body as { printingId: string };

  if (!printingId) {
    throw new AppError(400, "BAD_REQUEST", "printingId is required");
  }

  const ps = await db
    .selectFrom("printing_sources")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!ps) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  const target = await db
    .selectFrom("printings")
    .select(["finish", "art_variant", "is_signed", "is_promo"])
    .where("id", "=", printingId)
    .executeTakeFirst();

  if (!target) {
    throw new AppError(404, "NOT_FOUND", "Target printing not found");
  }

  await db
    .insertInto("printing_sources")
    .values({
      card_source_id: ps.card_source_id,
      printing_id: printingId,
      source_id: ps.source_id,
      set_id: ps.set_id,
      set_name: ps.set_name,
      collector_number: ps.collector_number,
      rarity: ps.rarity,
      art_variant: target.art_variant,
      is_signed: target.is_signed,
      is_promo: target.is_promo,
      finish: target.finish,
      artist: ps.artist,
      public_code: ps.public_code,
      printed_rules_text: ps.printed_rules_text,
      printed_effect_text: ps.printed_effect_text,
      image_url: ps.image_url,
      flavor_text: ps.flavor_text,
      extra_data: ps.extra_data,
    })
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-sources/link ─────────────────────────────────
// Bulk-link (or unlink) printing sources to a printing
cardSourcesRoute.post("/card-sources/printing-sources/link", async (c) => {
  const body = await c.req.json();
  const { printingSourceIds, printingId } = body as {
    printingSourceIds: string[];
    printingId: string | null;
  };

  if (!Array.isArray(printingSourceIds) || printingSourceIds.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "printingSourceIds[] required");
  }

  await db
    .updateTable("printing_sources")
    .set({ printing_id: printingId, updated_at: new Date() })
    .where("id", "in", printingSourceIds)
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/:cardId/rename ────────────────────────────────────────
cardSourcesRoute.post("/card-sources/:cardId/rename", async (c) => {
  const { cardId } = c.req.param();
  const body = await c.req.json();
  const { newId } = body as { newId: string };

  if (!newId?.trim()) {
    throw new AppError(400, "BAD_REQUEST", "newId is required");
  }

  if (newId === cardId) {
    return c.json({ ok: true });
  }

  // ON UPDATE CASCADE handles all FK references
  await db
    .updateTable("cards")
    .set({ id: newId.trim(), updated_at: new Date() })
    .where("id", "=", cardId)
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/:cardId/accept-field ─────────────────────────────────
cardSourcesRoute.post("/card-sources/:cardId/accept-field", async (c) => {
  const { cardId } = c.req.param();
  const body = await c.req.json();
  const { field, value } = body;

  if (!field) {
    throw new AppError(400, "BAD_REQUEST", "field is required");
  }

  const allowedFields: Record<string, string> = {
    name: "name",
    type: "type",
    superTypes: "super_types",
    domains: "domains",
    might: "might",
    energy: "energy",
    power: "power",
    mightBonus: "might_bonus",
    rulesText: "rules_text",
    effectText: "effect_text",
    tags: "tags",
  };

  const dbField = allowedFields[field];
  if (!dbField) {
    throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
  }

  const updates: Record<string, unknown> = { [dbField]: value, updated_at: new Date() };

  // Recompute keywords when rules_text or effect_text changes
  if (dbField === "rules_text" || dbField === "effect_text") {
    const card = await db
      .selectFrom("cards")
      .select(["rules_text", "effect_text"])
      .where("id", "=", cardId)
      .executeTakeFirstOrThrow();
    const rulesText = dbField === "rules_text" ? (value as string) : card.rules_text;
    const effectText = dbField === "effect_text" ? (value as string) : card.effect_text;
    updates.keywords = [
      ...extractKeywords(rulesText ?? ""),
      ...extractKeywords(effectText ?? ""),
    ].filter((v, i, a) => a.indexOf(v) === i);
  }

  await db.updateTable("cards").set(updates).where("id", "=", cardId).execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/printing/:printingId/accept-field ────────────────────
cardSourcesRoute.post("/card-sources/printing/:printingId/accept-field", async (c) => {
  const { printingId } = c.req.param();
  const body = await c.req.json();
  const { field, value } = body;

  if (!field) {
    throw new AppError(400, "BAD_REQUEST", "field is required");
  }

  const allowedFields: Record<string, string> = {
    sourceId: "source_id",
    setId: "set_id",
    collectorNumber: "collector_number",
    rarity: "rarity",
    artVariant: "art_variant",
    isSigned: "is_signed",
    isPromo: "is_promo",
    finish: "finish",
    artist: "artist",
    publicCode: "public_code",
    printedRulesText: "printed_rules_text",
    printedEffectText: "printed_effect_text",
    flavorText: "flavor_text",
  };

  const dbField = allowedFields[field];
  if (!dbField) {
    throw new AppError(400, "BAD_REQUEST", `Invalid field: ${field}`);
  }

  await db
    .updateTable("printings")
    .set({ [dbField]: value, updated_at: new Date() })
    .where("id", "=", printingId)
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/printing/:printingId/rename ──────────────────────────
cardSourcesRoute.post("/card-sources/printing/:printingId/rename", async (c) => {
  const { printingId } = c.req.param();
  const body = await c.req.json();
  const { newId } = body as { newId: string };

  if (!newId?.trim()) {
    throw new AppError(400, "BAD_REQUEST", "newId is required");
  }

  if (newId === printingId) {
    return c.json({ ok: true });
  }

  // ON UPDATE CASCADE handles all FK references
  await db
    .updateTable("printings")
    .set({ id: newId.trim(), updated_at: new Date() })
    .where("id", "=", printingId)
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/new/:name/accept ─────────────────────────────────────
// Create new card from source data and link card_sources
cardSourcesRoute.post("/card-sources/new/:name/accept", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  const body = await c.req.json();
  const { cardFields } = body;

  if (!cardFields) {
    throw new AppError(400, "BAD_REQUEST", "cardFields required");
  }

  await db.transaction().execute(async (trx) => {
    await acceptNewCardFromSources(trx, { ...cardFields, name });
  });

  return c.json({ ok: true });
});

// ── POST /card-sources/new/:name/link ────────────────────────────────────────
// Link unmatched sources to an existing card
cardSourcesRoute.post("/card-sources/new/:name/link", async (c) => {
  const name = decodeURIComponent(c.req.param("name"));
  const body = await c.req.json();
  const { cardId } = body;

  if (!cardId) {
    throw new AppError(400, "BAD_REQUEST", "cardId required");
  }

  // Verify card exists
  const card = await db
    .selectFrom("cards")
    .select("id")
    .where("id", "=", cardId)
    .executeTakeFirst();

  if (!card) {
    throw new AppError(404, "NOT_FOUND", "Target card not found");
  }

  await db.transaction().execute(async (trx) => {
    await linkUnmatchedSources(trx, name, cardId);
  });

  return c.json({ ok: true });
});

// ── POST /card-sources/:cardId/accept-printing ──────────────────────────────
// Create a new printing from admin-selected fields, link all sources in the group
cardSourcesRoute.post("/card-sources/:cardId/accept-printing", async (c) => {
  const { cardId } = c.req.param();
  const body = await c.req.json();
  const { printingFields, printingSourceIds } = body;

  if (!printingFields || !Array.isArray(printingSourceIds) || printingSourceIds.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "printingFields and printingSourceIds[] required");
  }

  // Verify card exists
  const card = await db
    .selectFrom("cards")
    .select("id")
    .where("id", "=", cardId)
    .executeTakeFirst();

  if (!card) {
    throw new AppError(404, "NOT_FOUND", "Card not found");
  }

  const printingId =
    printingFields.id ||
    buildPrintingId(
      printingFields.sourceId,
      printingFields.artVariant ?? "",
      printingFields.isSigned ?? false,
      printingFields.isPromo ?? false,
      printingFields.finish ?? "normal",
    );

  // Get source name from the first printing_source's card_source
  const firstPs = await db
    .selectFrom("printing_sources")
    .innerJoin("card_sources", "card_sources.id", "printing_sources.card_source_id")
    .select("card_sources.source")
    .where("printing_sources.id", "=", printingSourceIds[0])
    .executeTakeFirst();

  await db.transaction().execute(async (trx) => {
    if (printingFields.setId) {
      await upsertSet(trx, printingFields.setId, printingFields.setName ?? printingFields.setId);
    }

    await trx
      .insertInto("printings")
      .values({
        id: printingId,
        card_id: cardId,
        set_id: printingFields.setId ?? "",
        source_id: printingFields.sourceId,
        collector_number: printingFields.collectorNumber ?? 0,
        rarity: printingFields.rarity || "Common",
        art_variant: printingFields.artVariant ?? "",
        is_signed: printingFields.isSigned ?? false,
        is_promo: printingFields.isPromo ?? false,
        finish: printingFields.finish ?? "normal",
        artist: printingFields.artist ?? "",
        public_code: printingFields.publicCode ?? "",
        printed_rules_text: printingFields.printedRulesText ?? "",
        printed_effect_text: printingFields.printedEffectText ?? "",
        flavor_text: printingFields.flavorText ?? "",
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({
          artist: eb.ref("excluded.artist"),
          public_code: eb.ref("excluded.public_code"),
          printed_rules_text: eb.ref("excluded.printed_rules_text"),
          printed_effect_text: eb.ref("excluded.printed_effect_text"),
          flavor_text: eb.ref("excluded.flavor_text"),
        })),
      )
      .execute();

    // Insert image from the first source
    if (printingFields.imageUrl) {
      await insertPrintingImage(
        trx,
        printingId,
        printingFields.imageUrl,
        firstPs?.source ?? "import",
      );
    }

    // Link all printing_sources in the group
    await trx
      .updateTable("printing_sources")
      .set({ printing_id: printingId, checked_at: new Date(), updated_at: new Date() })
      .where("id", "in", printingSourceIds)
      .execute();
  });

  return c.json({ ok: true, printingId });
});

// ── POST /card-sources/printing-sources/:id/accept-new ──────────────────────
// Create a new printing from a printing_source row (legacy, single source)
cardSourcesRoute.post("/card-sources/printing-sources/:id/accept-new", async (c) => {
  const { id } = c.req.param();

  const ps = await db
    .selectFrom("printing_sources")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!ps) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  if (ps.printing_id) {
    throw new AppError(400, "BAD_REQUEST", "Printing source already linked to a printing");
  }

  // Get the parent card_source to find card_id
  const cs = await db
    .selectFrom("card_sources")
    .select(["card_id", "source"])
    .where("id", "=", ps.card_source_id)
    .executeTakeFirst();

  if (!cs?.card_id) {
    throw new AppError(400, "BAD_REQUEST", "Card source is not linked to a card yet");
  }

  const printingId = buildPrintingId(
    ps.source_id,
    ps.art_variant ?? "",
    ps.is_signed,
    ps.is_promo,
    ps.finish,
  );

  await db.transaction().execute(async (trx) => {
    if (ps.set_id) {
      await upsertSet(trx, ps.set_id, ps.set_name ?? ps.set_id);
    }

    await trx
      .insertInto("printings")
      .values({
        id: printingId,
        card_id: cs.card_id as string,
        set_id: ps.set_id ?? "",
        source_id: ps.source_id,
        collector_number: ps.collector_number,
        rarity: ps.rarity as Rarity,
        art_variant: ps.art_variant ?? "",
        is_signed: ps.is_signed,
        is_promo: ps.is_promo,
        finish: ps.finish,
        artist: ps.artist ?? "",
        public_code: ps.public_code,
        printed_rules_text: ps.printed_rules_text ?? "",
        printed_effect_text: ps.printed_effect_text,
        flavor_text: ps.flavor_text,
      })
      .onConflict((oc) =>
        oc.column("id").doUpdateSet((eb) => ({
          artist: eb.ref("excluded.artist"),
          public_code: eb.ref("excluded.public_code"),
          printed_rules_text: eb.ref("excluded.printed_rules_text"),
          printed_effect_text: eb.ref("excluded.printed_effect_text"),
          flavor_text: eb.ref("excluded.flavor_text"),
        })),
      )
      .execute();

    await insertPrintingImage(trx, printingId, ps.image_url, cs.source);

    await trx
      .updateTable("printing_sources")
      .set({ printing_id: printingId, checked_at: new Date(), updated_at: new Date() })
      .where("id", "=", id)
      .execute();
  });

  return c.json({ ok: true, printingId });
});

// ── POST /card-sources/printing-sources/:id/set-image ───────────────────────
cardSourcesRoute.post("/card-sources/printing-sources/:id/set-image", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  const mode = body.mode as "main" | "additional";

  if (mode !== "main" && mode !== "additional") {
    throw new AppError(400, "BAD_REQUEST", "mode must be 'main' or 'additional'");
  }

  const ps = await db
    .selectFrom("printing_sources")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!ps) {
    throw new AppError(404, "NOT_FOUND", "Printing source not found");
  }

  if (!ps.printing_id) {
    throw new AppError(400, "BAD_REQUEST", "Printing source not linked to a printing");
  }

  if (!ps.image_url) {
    throw new AppError(400, "BAD_REQUEST", "Printing source has no image URL");
  }

  const cs = await db
    .selectFrom("card_sources")
    .select("source")
    .where("id", "=", ps.card_source_id)
    .executeTakeFirst();

  await db.transaction().execute(async (trx) => {
    await insertPrintingImage(
      trx,
      ps.printing_id as string,
      ps.image_url,
      cs?.source ?? "import",
      mode,
    );
  });

  return c.json({ ok: true });
});

// ── DELETE /card-sources/printing-images/:imageId ────────────────────────────
cardSourcesRoute.delete("/card-sources/printing-images/:imageId", async (c) => {
  const { imageId } = c.req.param();

  const image = await db
    .selectFrom("printing_images")
    .select(["id", "rehosted_url"])
    .where("id", "=", imageId)
    .executeTakeFirst();

  if (!image) {
    throw new AppError(404, "NOT_FOUND", "Printing image not found");
  }

  await db.deleteFrom("printing_images").where("id", "=", imageId).execute();

  if (image.rehosted_url) {
    await deleteRehostFiles(image.rehosted_url);
  }

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-images/:imageId/activate ────────────────────
cardSourcesRoute.post("/card-sources/printing-images/:imageId/activate", async (c) => {
  const { imageId } = c.req.param();
  const { active } = await c.req.json<{ active: boolean }>();

  const image = await db
    .selectFrom("printing_images")
    .innerJoin("printings", "printings.id", "printing_images.printing_id")
    .select([
      "printing_images.id",
      "printing_images.printing_id",
      "printing_images.face",
      "printing_images.rehosted_url",
      "printings.set_id",
    ])
    .where("printing_images.id", "=", imageId)
    .executeTakeFirst();

  if (!image) {
    throw new AppError(404, "NOT_FOUND", "Printing image not found");
  }

  const baseFileBase = printingIdToFileBase(image.printing_id);
  const mainPath = `/card-images/${image.set_id}/${baseFileBase}`;

  // Find the currently active image (if any) for file rename purposes
  const currentActive = active
    ? await db
        .selectFrom("printing_images")
        .select(["id", "rehosted_url"])
        .where("printing_id", "=", image.printing_id)
        .where("face", "=", image.face)
        .where("is_active", "=", true)
        .executeTakeFirst()
    : null;

  await db.transaction().execute(async (trx) => {
    if (active && currentActive) {
      // Deactivate the current active image
      await trx
        .updateTable("printing_images")
        .set({ is_active: false, updated_at: new Date() })
        .where("id", "=", currentActive.id)
        .execute();

      // Rename current active's files: main path → ID-suffixed path
      if (currentActive.rehosted_url) {
        const demotedPath = `${mainPath}-${currentActive.id}`;
        await renameRehostFiles(currentActive.rehosted_url, demotedPath);
        await trx
          .updateTable("printing_images")
          .set({ rehosted_url: demotedPath, updated_at: new Date() })
          .where("id", "=", currentActive.id)
          .execute();
      }
    }

    await trx
      .updateTable("printing_images")
      .set({ is_active: active, updated_at: new Date() })
      .where("id", "=", imageId)
      .execute();

    if (active && image.rehosted_url) {
      // Rename newly active image's files: ID-suffixed path → main path
      await renameRehostFiles(image.rehosted_url, mainPath);
      await trx
        .updateTable("printing_images")
        .set({ rehosted_url: mainPath, updated_at: new Date() })
        .where("id", "=", imageId)
        .execute();
    } else if (!active && image.rehosted_url) {
      // Demoting: rename from main path → ID-suffixed path
      const demotedPath = `${mainPath}-${image.id}`;
      await renameRehostFiles(image.rehosted_url, demotedPath);
      await trx
        .updateTable("printing_images")
        .set({ rehosted_url: demotedPath, updated_at: new Date() })
        .where("id", "=", imageId)
        .execute();
    }
  });

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-images/:imageId/unrehost ─────────────────────
cardSourcesRoute.post("/card-sources/printing-images/:imageId/unrehost", async (c) => {
  const { imageId } = c.req.param();

  const image = await db
    .selectFrom("printing_images")
    .select(["id", "rehosted_url", "original_url"])
    .where("id", "=", imageId)
    .executeTakeFirst();

  if (!image) {
    throw new AppError(404, "NOT_FOUND", "Printing image not found");
  }

  if (!image.rehosted_url) {
    throw new AppError(400, "BAD_REQUEST", "Image is not rehosted");
  }

  await deleteRehostFiles(image.rehosted_url);

  await db
    .updateTable("printing_images")
    .set({ rehosted_url: null, updated_at: new Date() })
    .where("id", "=", imageId)
    .execute();

  return c.json({ ok: true });
});

// ── POST /card-sources/printing-images/:imageId/rehost ──────────────────────
cardSourcesRoute.post("/card-sources/printing-images/:imageId/rehost", async (c) => {
  const { imageId } = c.req.param();

  const image = await db
    .selectFrom("printing_images")
    .innerJoin("printings", "printings.id", "printing_images.printing_id")
    .select([
      "printing_images.id",
      "printing_images.printing_id",
      "printing_images.original_url",
      "printing_images.is_active",
      "printings.set_id",
    ])
    .where("printing_images.id", "=", imageId)
    .executeTakeFirst();

  if (!image) {
    throw new AppError(404, "NOT_FOUND", "Printing image not found");
  }

  if (!image.original_url) {
    throw new AppError(400, "BAD_REQUEST", "Image has no original URL to rehost");
  }

  const { buffer, ext } = await downloadImage(image.original_url);
  const baseFileBase = printingIdToFileBase(image.printing_id);
  const fileBase = image.is_active ? baseFileBase : `${baseFileBase}-${image.id}`;
  const outputDir = join(CARD_IMAGES_DIR, image.set_id);

  await processAndSave(buffer, ext, outputDir, fileBase);

  const rehostedUrl = `/card-images/${image.set_id}/${fileBase}`;

  await db
    .updateTable("printing_images")
    .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
    .where("id", "=", imageId)
    .execute();

  return c.json({ ok: true, rehostedUrl });
});

// ── POST /card-sources/printing/:printingId/add-image-url ───────────────────
cardSourcesRoute.post("/card-sources/printing/:printingId/add-image-url", async (c) => {
  const { printingId } = c.req.param();
  const body = await c.req.json<{ url: string; source?: string; mode?: "main" | "additional" }>();

  if (!body.url?.trim()) {
    throw new AppError(400, "BAD_REQUEST", "url is required");
  }

  const mode = body.mode ?? "main";
  const source = body.source?.trim() || "manual";

  await db.transaction().execute(async (trx) => {
    await insertPrintingImage(trx, printingId, body.url.trim(), source, mode);
  });

  return c.json({ ok: true });
});

// ── POST /card-sources/printing/:printingId/upload-image ────────────────────
cardSourcesRoute.post("/card-sources/printing/:printingId/upload-image", async (c) => {
  const { printingId } = c.req.param();

  const printing = await db
    .selectFrom("printings")
    .select("set_id")
    .where("id", "=", printingId)
    .executeTakeFirst();

  if (!printing) {
    throw new AppError(404, "NOT_FOUND", "Printing not found");
  }

  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    throw new AppError(400, "BAD_REQUEST", "file is required");
  }

  const mode = (body.mode as string) === "additional" ? ("additional" as const) : ("main" as const);
  const source = (body.source as string)?.trim() || "upload";

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name ? `.${file.name.split(".").pop()?.toLowerCase() ?? "png"}` : ".png";
  const baseFileBase = printingIdToFileBase(printingId);
  const outputDir = join(CARD_IMAGES_DIR, printing.set_id);

  // Insert the DB row first so we have the ID for non-main file paths
  const imageRow = await db.transaction().execute(async (trx) => {
    if (mode === "main") {
      await trx
        .updateTable("printing_images")
        .set({ is_active: false, updated_at: new Date() })
        .where("printing_id", "=", printingId)
        .where("face", "=", "front")
        .where("is_active", "=", true)
        .execute();
    }

    return trx
      .insertInto("printing_images")
      .values({
        printing_id: printingId,
        face: "front",
        source,
        is_active: mode === "main",
      })
      .onConflict((oc) =>
        oc.columns(["printing_id", "face", "source"]).doUpdateSet({
          is_active: mode === "main",
          updated_at: new Date(),
        }),
      )
      .returning("id")
      .executeTakeFirstOrThrow();
  });

  const fileBase = mode === "main" ? baseFileBase : `${baseFileBase}-${imageRow.id}`;
  await processAndSave(buffer, ext, outputDir, fileBase);

  const rehostedUrl = `/card-images/${printing.set_id}/${fileBase}`;

  await db
    .updateTable("printing_images")
    .set({ rehosted_url: rehostedUrl, updated_at: new Date() })
    .where("id", "=", imageRow.id)
    .execute();

  return c.json({ ok: true, rehostedUrl });
});

// ── POST /card-sources/upload ───────────────────────────────────────────────
cardSourcesRoute.post("/card-sources/upload", async (c) => {
  const body = await c.req.json();
  const { source, candidates } = body;

  if (!source || typeof source !== "string" || source.trim() === "") {
    throw new AppError(400, "BAD_REQUEST", "Non-empty source name is required");
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "Non-empty candidates array is required");
  }

  // Transform candidates to the ingestion format
  const cards = candidates.map(
    (candidate: { card: Record<string, unknown>; printings: Record<string, unknown>[] }) => ({
      name: candidate.card.name as string,
      type: candidate.card.type as string,
      super_types: (candidate.card.super_types as string[]) ?? [],
      domains: candidate.card.domains as string[],
      might: candidate.card.might as number | null,
      energy: candidate.card.energy as number | null,
      power: candidate.card.power as number | null,
      might_bonus: (candidate.card.might_bonus as number | null) ?? null,
      rules_text: candidate.card.rules_text as string,
      effect_text: (candidate.card.effect_text as string) ?? "",
      tags: (candidate.card.tags as string[]) ?? [],
      source_id: (candidate.card.source_id as string) ?? null,
      source_entity_id: (candidate.card.source_entity_id as string) ?? null,
      extra_data: (candidate.card.extra_data as Record<string, unknown>) ?? null,
      printings: candidate.printings as {
        source_id: string;
        set_id: string;
        set_name?: string | null;
        collector_number: number;
        rarity: string;
        art_variant: string;
        is_signed: boolean;
        is_promo: boolean;
        finish: string;
        artist: string;
        public_code: string;
        printed_rules_text: string;
        printed_effect_text: string;
        image_url?: string | null;
        flavor_text?: string;
        extra_data?: unknown | null;
      }[],
    }),
  );

  const result = await ingestCardSources(db, source.trim(), cards);

  return c.json({
    newCards: result.newCards,
    updates: result.updates,
    unchanged: result.unchanged,
    errors: result.errors,
    updatedCards: result.updatedCards,
  });
});

// ── DELETE /card-sources/by-source/:source ────────────────────────────────────
// Delete all card_sources (and cascaded printing_sources) for a given source name
cardSourcesRoute.delete("/card-sources/by-source/:source", async (c) => {
  const source = decodeURIComponent(c.req.param("source"));
  if (!source.trim()) {
    throw new AppError(400, "BAD_REQUEST", "Source name is required");
  }

  const result = await db.deleteFrom("card_sources").where("source", "=", source.trim()).execute();

  const deleted = Number(result[0].numDeletedRows);
  return c.json({ status: "ok", source, deleted });
});
