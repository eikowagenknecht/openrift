import { zValidator } from "@hono/zod-validator";
import { extractKeywords } from "@openrift/shared/keywords";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";
import type { SqlBool } from "kysely";
import { sql } from "kysely";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../../errors.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import { resolveCardId } from "./helpers.js";
import { cardSourcesQuerySchema } from "./schemas.js";

// ── GET /all-cards ──────────────────────────────────────────────────────────
// Lightweight list of all cards for client-side search (link combobox etc.)
export const queriesRoute = new Hono<{ Variables: Variables }>()
  .get("/all-cards", async (c) => {
    const rows = await db
      .selectFrom("cards")
      .select(["id", "slug", "name", "type"])
      .orderBy("name")
      .execute();

    return c.json(rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, type: r.type })));
  })

  // ── GET /source-names ──────────────────────────────────────────────────────
  // List distinct source names for the combobox on the upload page
  .get("/source-names", async (c) => {
    const rows = await db
      .selectFrom("card_sources")
      .select("source")
      .distinct()
      .orderBy("source")
      .execute();

    return c.json(rows.map((r) => r.source));
  })

  // ── GET /source-stats ───────────────────────────────────────────────────────
  // Per-source card and printing counts
  .get("/source-stats", async (c) => {
    const rows = await db
      .selectFrom("card_sources as cs")
      .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
      .select((eb) => [
        "cs.source" as const,
        eb.fn.count<number>("cs.name").distinct().as("cardCount"),
        eb.fn.count<number>("ps.id").distinct().as("printingCount"),
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
  })

  // ── GET / ───────────────────────────────────────────────────────────────────
  // List all cards + unmatched groups with source/unchecked counts
  .get("/", zValidator("query", cardSourcesQuerySchema), async (c) => {
    const queryParams = c.req.valid("query");
    const filter = queryParams.filter ?? "all";
    const source = queryParams.source;

    // Get summaries grouped by resolved card_id (matched) or name (unmatched).
    // resolveCardId dynamically matches sources to cards by name/alias even when
    // card_sources.card_id is NULL, so re-uploaded sources auto-merge.
    const rcid = resolveCardId("cs");
    let query = db
      .selectFrom("card_sources as cs")
      .leftJoin("printing_sources as ps", "ps.card_source_id", "cs.id")
      .leftJoin("sets as s", "s.slug", "ps.set_id")
      .leftJoin("cards as c", (jb) => jb.on(sql`c.id = (${rcid})`))
      // raw sql: could use fn.count(eb.case()...).distinct() but the sql`` form is
      // much more readable for these multi-condition conditional aggregates
      .select([
        sql<string | null>`max((${rcid})::text)`.as("card_id"),
        sql<string | null>`max(c.slug)`.as("card_slug"),
        sql<string>`COALESCE(max(c.name), min(cs.name))`.as("name"),
        sql<string>`COALESCE((${rcid})::text, cs.norm_name)`.as("groupKey"),
        sql<number>`count(DISTINCT cs.source)`.as("sourceCount"),
        sql<number>`count(DISTINCT CASE WHEN cs.checked_at IS NULL THEN cs.id END)`.as(
          "uncheckedCardCount",
        ),
        sql<number>`count(DISTINCT CASE WHEN ps.checked_at IS NULL AND ps.id IS NOT NULL THEN ps.id END)`.as(
          "uncheckedPrintingCount",
        ),
        sql<boolean>`bool_or(cs.source = 'gallery')`.as("hasGallery"),
        // Sort tier detection: does this card have printings in a released/known/unknown set?
        sql<string | null>`min(s.released_at::text) FILTER (WHERE s.released_at IS NOT NULL)`.as(
          "minReleasedAt",
        ),
        sql<string | null>`min(s.slug) FILTER (WHERE s.released_at IS NOT NULL)`.as(
          "releasedSetSlug",
        ),
        sql<boolean>`bool_or(s.id IS NOT NULL AND s.released_at IS NULL)`.as("hasKnownSet"),
        sql<boolean>`bool_or(ps.id IS NOT NULL AND s.id IS NULL)`.as("hasUnknownSet"),
      ])
      .groupBy(sql`COALESCE((${rcid})::text, cs.norm_name)`);

    if (source) {
      // Only include cards that have at least one card_source from this source.
      // Uses resolved card_id so dynamically-matched sources group correctly.
      const rcid2 = resolveCardId("cs2");
      query = query.where((eb) =>
        eb.exists(
          eb
            .selectFrom("card_sources as cs2")
            .select(sql.lit(1).as("x"))
            .where("cs2.source", "=", source)
            .where(
              sql<SqlBool>`COALESCE((${rcid2})::text, cs2.norm_name) = COALESCE((${rcid})::text, cs.norm_name)`,
            ),
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
      // Only show truly unmatched sources (no card match by name or alias either)
      query = query.where(sql<SqlBool>`(${rcid}) IS NULL`);
    }

    const rows = await query.execute();

    // Include cards that have no card_sources (unless filtering for unmatched/source)
    type ResultRow = (typeof rows)[number] & { _fromCard?: boolean };
    const allRows: ResultRow[] = [...rows];

    if (filter !== "unmatched" && !source) {
      const cardIdsWithSources = new Set(
        rows.filter((r) => r.card_id).map((r) => r.card_id as string),
      );
      let orphanQuery = db.selectFrom("cards as c").select(["c.id", "c.slug", "c.name"]);
      if (cardIdsWithSources.size > 0) {
        orphanQuery = orphanQuery.where("c.id", "not in", [...cardIdsWithSources]);
      }
      const orphanCards = await orphanQuery.execute();

      for (const oc of orphanCards) {
        allRows.push({
          card_id: oc.id,
          card_slug: oc.slug,
          name: oc.name,
          groupKey: oc.id,
          sourceCount: 0 as unknown as number,
          uncheckedCardCount: 0 as unknown as number,
          uncheckedPrintingCount: 0 as unknown as number,
          hasGallery: false as unknown as boolean,
          minReleasedAt: null as unknown as string | null,
          releasedSetSlug: null as unknown as string | null,
          hasKnownSet: false as unknown as boolean,
          hasUnknownSet: false as unknown as boolean,
          _fromCard: true,
        });
      }

      // Fetch set release info for orphan cards via their printings
      const orphanIds = orphanCards.map((oc) => oc.id);
      if (orphanIds.length > 0) {
        const orphanPrintings = await db
          .selectFrom("printings as p")
          .innerJoin("sets as s", "s.id", "p.set_id")
          .select(["p.card_id", "s.slug", "s.released_at"])
          .where("p.card_id", "in", orphanIds)
          .execute();
        for (const op of orphanPrintings) {
          const row = allRows.find((r) => r.card_id === op.card_id && r._fromCard);
          if (!row) {
            continue;
          }
          const relDate =
            (op.released_at as unknown) instanceof Date
              ? (op.released_at as unknown as Date).toISOString().slice(0, 10)
              : (op.released_at ?? null);
          if (relDate) {
            if (!row.minReleasedAt || relDate < row.minReleasedAt) {
              row.minReleasedAt = relDate as string | null;
              row.releasedSetSlug = op.slug as string | null;
            } else if (
              relDate === row.minReleasedAt &&
              (!row.releasedSetSlug || op.slug < row.releasedSetSlug)
            ) {
              row.releasedSetSlug = op.slug as string | null;
            }
          } else {
            row.hasKnownSet = true as unknown as boolean;
          }
        }
      }
    }

    // Compute dynamic match suggestions for unmatched groups
    const unmatchedNormNames = allRows.filter((r) => !r.card_id).map((r) => r.groupKey as string);

    const suggestionMap = new Map<string, { id: string; slug: string; name: string }>();
    if (unmatchedNormNames.length > 0) {
      const suggestions = await db
        .selectFrom("cards as c")
        .select(["c.id", "c.slug", "c.name", "c.norm_name as norm"])
        .where("c.norm_name", "in", unmatchedNormNames)
        .execute();
      for (const s of suggestions) {
        suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
      }

      // Also check aliases for matches not covered by direct card name
      const missingNorms = unmatchedNormNames.filter((n) => !suggestionMap.has(n));
      if (missingNorms.length > 0) {
        const aliasSuggestions = await db
          .selectFrom("card_name_aliases as cna")
          .innerJoin("cards as c", "c.id", "cna.card_id")
          .select(["c.id", "c.slug", "c.name", "cna.norm_name as norm"])
          .where("cna.norm_name", "in", missingNorms)
          .execute();
        for (const s of aliasSuggestions) {
          if (!suggestionMap.has(s.norm as string)) {
            suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
          }
        }
      }
    }

    // Load printing source IDs for matched cards (like marketplace shows OGN-042, OGN-042a)
    const matchedCardIds = allRows.filter((r) => r.card_id).map((r) => r.card_id as string);
    const printingSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const printingRows = await db
        .selectFrom("printings")
        .select(["card_id", "source_id"])
        .where("card_id", "in", matchedCardIds)
        .orderBy("source_id")
        .execute();
      for (const pr of printingRows) {
        const existing = printingSourceIdsMap.get(pr.card_id);
        if (existing) {
          existing.push(pr.source_id);
        } else {
          printingSourceIdsMap.set(pr.card_id, [pr.source_id]);
        }
      }
    }

    // Load candidate printing source IDs for matched cards (printing_sources with no printing_id yet)
    const candidateSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const matchedNormNames = allRows
        .filter((r) => r.card_id)
        .map((r) => normalizeNameForMatching(String(r.name)));
      const candidateRows = await db
        .selectFrom("printing_sources as ps")
        .innerJoin("card_sources as cs", "cs.id", "ps.card_source_id")
        .select([resolveCardId("cs").as("card_id"), "ps.source_id"])
        .where("cs.norm_name", "in", matchedNormNames)
        .where("ps.printing_id", "is", null)
        .orderBy("ps.source_id")
        .execute();
      for (const cr of candidateRows) {
        const cardId = cr.card_id as string | null;
        if (!cardId) {
          continue;
        }
        const existing = candidateSourceIdsMap.get(cardId);
        if (existing) {
          if (!existing.includes(cr.source_id)) {
            existing.push(cr.source_id);
          }
        } else {
          candidateSourceIdsMap.set(cardId, [cr.source_id]);
        }
      }
    }

    // Load printing source IDs for unmatched cards (from printing_sources via card_sources)
    const unmatchedGroupKeys = allRows.filter((r) => !r.card_id).map((r) => r.groupKey as string);
    const pendingSourceIdsMap = new Map<string, string[]>();
    if (unmatchedGroupKeys.length > 0) {
      const pendingRows = await db
        .selectFrom("printing_sources as ps")
        .innerJoin("card_sources as cs", "cs.id", "ps.card_source_id")
        .select(["cs.norm_name as norm", "ps.source_id"])
        .where("cs.norm_name", "in", unmatchedGroupKeys)
        .orderBy("ps.source_id")
        .execute();
      for (const pr of pendingRows) {
        const norm = pr.norm as string;
        const existing = pendingSourceIdsMap.get(norm);
        if (existing) {
          if (!existing.includes(pr.source_id)) {
            existing.push(pr.source_id);
          }
        } else {
          pendingSourceIdsMap.set(norm, [pr.source_id]);
        }
      }
    }

    // Sort by tier (released → known set → unknown set → no printings), then release date, then card slug
    // For candidates without a slug, derive a suggested ID from the first pending source ID
    const suggestedCardIdFor = (r: (typeof allRows)[number]): string | null => {
      if (r.card_slug) {
        return null;
      }
      const pending = pendingSourceIdsMap.get(r.groupKey as string);
      if (!pending || pending.length === 0) {
        return null;
      }
      return pending[0].replace(/(?<=\d)[a-z*]+$/, "");
    };

    allRows.sort((a, b) => {
      function tier(r: (typeof allRows)[number]): number {
        if (r.minReleasedAt) {
          return 0;
        }
        if (r.hasKnownSet) {
          return 1;
        }
        if (r.hasUnknownSet) {
          return 2;
        }
        return 3;
      }
      const ta = tier(a);
      const tb = tier(b);
      if (ta !== tb) {
        return ta - tb;
      }
      // Within the same tier, sort by release date, then set slug
      const dateA = a.minReleasedAt ?? "";
      const dateB = b.minReleasedAt ?? "";
      if (dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      const setA = a.releasedSetSlug ?? "";
      const setB = b.releasedSetSlug ?? "";
      if (setA !== setB) {
        return setA.localeCompare(setB);
      }
      // Cards with a slug first (by slug), then candidates (by suggested ID), then rest (by name)
      const keyA = a.card_slug ?? suggestedCardIdFor(a);
      const keyB = b.card_slug ?? suggestedCardIdFor(b);
      const hasKeyA = keyA ? 0 : 1;
      const hasKeyB = keyB ? 0 : 1;
      if (hasKeyA !== hasKeyB) {
        return hasKeyA - hasKeyB;
      }
      const nameA = keyA ?? String(a.name);
      const nameB = keyB ?? String(b.name);
      return nameA.localeCompare(nameB);
    });

    return c.json(
      allRows.map((r) => ({
        cardId: r.card_id ?? null,
        cardSlug: r.card_slug ?? null,
        name: r.name,
        normalizedName: r.card_id ? normalizeNameForMatching(String(r.name)) : r.groupKey,
        sourceIds: r.card_id ? (printingSourceIdsMap.get(r.card_id as string) ?? []) : [],
        pendingSourceIds: r.card_id ? [] : (pendingSourceIdsMap.get(r.groupKey as string) ?? []),
        candidateSourceIds: r.card_id ? (candidateSourceIdsMap.get(r.card_id as string) ?? []) : [],
        sourceCount: Number(r.sourceCount),
        uncheckedCardCount: Number(r.uncheckedCardCount),
        uncheckedPrintingCount: Number(r.uncheckedPrintingCount),
        hasGallery: Boolean(r.hasGallery),
        suggestedCard: r.card_id ? null : (suggestionMap.get(r.groupKey as string) ?? null),
      })),
    );
  })

  // ── GET /export ────────────────────────────────────────────────────────────
  // Export all active cards + printings in the same JSON format the upload endpoint accepts
  .get("/export", async (c) => {
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
        "sets.slug as set_slug",
        "sets.name as set_name",
        "printing_images.rehosted_url",
        "printing_images.original_url",
      ])
      .orderBy("printings.set_id")
      .orderBy("printings.collector_number")
      .orderBy("printings.art_variant")
      .orderBy("printings.finish")
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
        rules_text: card.rules_text ?? null,
        effect_text: card.effect_text ?? null,
        tags: card.tags,
        source_id: card.slug,
        source_entity_id: card.id,
        extra_data: null,
      },
      printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
        source_id: p.source_id,
        set_id: p.set_slug,
        set_name: p.set_name,
        collector_number: p.collector_number,
        rarity: p.rarity,
        art_variant: p.art_variant,
        is_signed: p.is_signed,
        finish: p.finish,
        artist: p.artist,
        public_code: p.public_code,
        printed_rules_text: p.printed_rules_text,
        printed_effect_text: p.printed_effect_text,
        image_url: p.original_url ?? p.rehosted_url ?? null,
        flavor_text: p.flavor_text,
        source_entity_id: p.id,
        extra_data: null,
      })),
    }));

    return c.json(candidates);
  })

  // ── GET /:cardId ──────────────────────────────────────────────────────────
  // Detail: active card + all card_sources + printings + printing_sources
  .get("/:cardId", async (c) => {
    const cardSlug = c.req.param("cardId");

    const card = await db
      .selectFrom("cards")
      .selectAll()
      .where("slug", "=", cardSlug)
      .executeTakeFirst();

    if (!card) {
      throw new AppError(404, "NOT_FOUND", "Card not found");
    }

    // Find sources matched by card name or alias
    const cardNormName = normalizeNameForMatching(card.name);
    const aliasRows = await db
      .selectFrom("card_name_aliases")
      .select("norm_name")
      .where("card_id", "=", card.id)
      .execute();
    const nameVariants = [cardNormName, ...aliasRows.map((a) => a.norm_name)];
    const uniqueVariants = [...new Set(nameVariants)];

    // Find sources by name/alias OR by printing source_id match (same fallback as resolveCardId)
    const printingSourceIds = await db
      .selectFrom("printings")
      .select("source_id")
      .where("card_id", "=", card.id)
      .execute();
    const matchingSourceIds = printingSourceIds.map((p) => p.source_id);

    let sourcesQuery = db
      .selectFrom("card_sources")
      .selectAll()
      .where("card_sources.norm_name", "in", uniqueVariants);

    if (matchingSourceIds.length > 0) {
      sourcesQuery = db
        .selectFrom("card_sources")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("card_sources.norm_name", "in", uniqueVariants),
            eb.exists(
              eb
                .selectFrom("printing_sources as ps_match")
                .select(sql.lit(1).as("x"))
                .whereRef("ps_match.card_source_id", "=", "card_sources.id")
                .where("ps_match.source_id", "in", matchingSourceIds),
            ),
          ]),
        );
    }

    const sources = await sourcesQuery.orderBy("source").execute();

    const printings = await db
      .selectFrom("printings")
      .selectAll()
      .where("card_id", "=", card.id)
      .execute();

    const sourceIds = sources.map((s) => s.id);
    const printingSources =
      sourceIds.length > 0
        ? await db
            .selectFrom("printing_sources")
            .selectAll()
            .where("card_source_id", "in", sourceIds)
            .orderBy("set_id")
            .orderBy("finish")
            .orderBy("is_signed")
            .orderBy("source_id")
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

    // Build set UUID → slug map for printings response
    const setIds = [...new Set(printings.map((p) => p.set_id))];
    const setSlugMap = new Map<string, string>();
    if (setIds.length > 0) {
      const setRows = await db
        .selectFrom("sets")
        .select(["id", "slug"])
        .where("id", "in", setIds)
        .execute();
      for (const s of setRows) {
        setSlugMap.set(s.id, s.slug);
      }
    }

    return c.json({
      card: {
        id: card.id,
        slug: card.slug,
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
        source: s.source,
        name: s.name,
        type: s.type,
        superTypes: s.super_types,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.might_bonus,
        keywords: [
          ...extractKeywords(s.rules_text ?? ""),
          ...extractKeywords(s.effect_text ?? ""),
        ].filter((v, i, a) => a.indexOf(v) === i),
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
        slug: p.slug,
        cardId: card.id,
        setId: setSlugMap.get(p.set_id) ?? p.set_id,
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
        comment: p.comment,
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
        sourceEntityId: ps.source_entity_id,
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
  })

  // ── GET /new/:name ────────────────────────────────────────────────────────
  // Unmatched detail: card_sources grouped by normalized name (no matching card)
  .get("/new/:name", async (c) => {
    const name = decodeURIComponent(c.req.param("name"));

    const sources = await db
      .selectFrom("card_sources")
      .selectAll()
      .where("card_sources.norm_name", "=", name)
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
      .orderBy("collector_number")
      .orderBy("source_id")
      .execute();

    // Use the shortest raw name from the group as the display name
    const displayName = sources.reduce(
      (best, s) => (s.name.length < best.length ? s.name : best),
      sources[0].name,
    );

    return c.json({
      name: displayName,
      sources: sources.map((s) => ({
        id: s.id,
        source: s.source,
        name: s.name,
        type: s.type,
        superTypes: s.super_types,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.might_bonus,
        keywords: [
          ...extractKeywords(s.rules_text ?? ""),
          ...extractKeywords(s.effect_text ?? ""),
        ].filter((v, i, a) => a.indexOf(v) === i),
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
        sourceEntityId: ps.source_entity_id,
        extraData: ps.extra_data,
        checkedAt: ps.checked_at?.toISOString() ?? null,
        createdAt: ps.created_at.toISOString(),
        updatedAt: ps.updated_at.toISOString(),
      })),
    });
  });
