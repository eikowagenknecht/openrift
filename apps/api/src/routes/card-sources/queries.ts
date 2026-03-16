import { zValidator } from "@hono/zod-validator";
import { extractKeywords } from "@openrift/shared/keywords";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import { Hono } from "hono";
import type { SqlBool } from "kysely";
import { sql } from "kysely";

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
    const db = c.get("db");
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
    const db = c.get("db");
    const rows = await db
      .selectFrom("cardSources")
      .select("source")
      .distinct()
      .orderBy("source")
      .execute();

    return c.json(rows.map((r) => r.source));
  })

  // ── GET /source-stats ───────────────────────────────────────────────────────
  // Per-source card and printing counts
  .get("/source-stats", async (c) => {
    const db = c.get("db");
    const rows = await db
      .selectFrom("cardSources as cs")
      .leftJoin("printingSources as ps", "ps.cardSourceId", "cs.id")
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
    const db = c.get("db");
    const queryParams = c.req.valid("query");
    const filter = queryParams.filter ?? "all";
    const source = queryParams.source;

    // Get summaries grouped by resolved card_id (matched) or name (unmatched).
    // resolveCardId dynamically matches sources to cards by name/alias even when
    // card_sources.card_id is NULL, so re-uploaded sources auto-merge.
    const rcid = resolveCardId("cs");
    let query = db
      .selectFrom("cardSources as cs")
      .leftJoin("printingSources as ps", "ps.cardSourceId", "cs.id")
      .leftJoin("sets as s", "s.slug", "ps.setId")
      .leftJoin("cards as c", (jb) => jb.on(sql`c.id = (${rcid})`))
      // raw sql: could use fn.count(eb.case()...).distinct() but the sql`` form is
      // much more readable for these multi-condition conditional aggregates
      .select([
        sql<string | null>`max((${rcid})::text)`.as("cardId"),
        sql<string | null>`max(c.slug)`.as("cardSlug"),
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
            .selectFrom("cardSources as cs2")
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
        rows.filter((r) => r.cardId).map((r) => r.cardId as string),
      );
      let orphanQuery = db.selectFrom("cards as c").select(["c.id", "c.slug", "c.name"]);
      if (cardIdsWithSources.size > 0) {
        orphanQuery = orphanQuery.where("c.id", "not in", [...cardIdsWithSources]);
      }
      const orphanCards = await orphanQuery.execute();

      for (const oc of orphanCards) {
        allRows.push({
          cardId: oc.id,
          cardSlug: oc.slug,
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
          .innerJoin("sets as s", "s.id", "p.setId")
          .select(["p.cardId", "s.slug", "s.releasedAt"])
          .where("p.cardId", "in", orphanIds)
          .execute();
        for (const op of orphanPrintings) {
          const row = allRows.find((r) => r.cardId === op.cardId && r._fromCard);
          if (!row) {
            continue;
          }
          const relDate =
            (op.releasedAt as unknown) instanceof Date
              ? (op.releasedAt as unknown as Date).toISOString().slice(0, 10)
              : (op.releasedAt ?? null);
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
    const unmatchedNormNames = allRows.filter((r) => !r.cardId).map((r) => r.groupKey as string);

    const suggestionMap = new Map<string, { id: string; slug: string; name: string }>();
    if (unmatchedNormNames.length > 0) {
      const suggestions = await db
        .selectFrom("cards as c")
        .select(["c.id", "c.slug", "c.name", "c.normName as norm"])
        .where("c.normName", "in", unmatchedNormNames)
        .execute();
      for (const s of suggestions) {
        suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
      }

      // Also check aliases for matches not covered by direct card name
      const missingNorms = unmatchedNormNames.filter((n) => !suggestionMap.has(n));
      if (missingNorms.length > 0) {
        const aliasSuggestions = await db
          .selectFrom("cardNameAliases as cna")
          .innerJoin("cards as c", "c.id", "cna.cardId")
          .select(["c.id", "c.slug", "c.name", "cna.normName as norm"])
          .where("cna.normName", "in", missingNorms)
          .execute();
        for (const s of aliasSuggestions) {
          if (!suggestionMap.has(s.norm as string)) {
            suggestionMap.set(s.norm as string, { id: s.id, slug: s.slug, name: s.name });
          }
        }
      }
    }

    // Load printing source IDs for matched cards (like marketplace shows OGN-042, OGN-042a)
    const matchedCardIds = allRows.filter((r) => r.cardId).map((r) => r.cardId as string);
    const printingSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const printingRows = await db
        .selectFrom("printings")
        .select(["cardId", "sourceId"])
        .where("cardId", "in", matchedCardIds)
        .orderBy("sourceId")
        .execute();
      for (const pr of printingRows) {
        const existing = printingSourceIdsMap.get(pr.cardId);
        if (existing) {
          existing.push(pr.sourceId);
        } else {
          printingSourceIdsMap.set(pr.cardId, [pr.sourceId]);
        }
      }
    }

    // Load candidate printing source IDs for matched cards (printing_sources with no printing_id yet)
    const candidateSourceIdsMap = new Map<string, string[]>();
    if (matchedCardIds.length > 0) {
      const matchedNormNames = allRows
        .filter((r) => r.cardId)
        .map((r) => normalizeNameForMatching(String(r.name)));
      const candidateRows = await db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs", "cs.id", "ps.cardSourceId")
        .select([resolveCardId("cs").as("cardId"), "ps.sourceId"])
        .where("cs.normName", "in", matchedNormNames)
        .where("ps.printingId", "is", null)
        .orderBy("ps.sourceId")
        .execute();
      for (const cr of candidateRows) {
        const cardId = cr.cardId as string | null;
        if (!cardId) {
          continue;
        }
        const existing = candidateSourceIdsMap.get(cardId);
        if (existing) {
          if (!existing.includes(cr.sourceId)) {
            existing.push(cr.sourceId);
          }
        } else {
          candidateSourceIdsMap.set(cardId, [cr.sourceId]);
        }
      }
    }

    // Load printing source IDs for unmatched cards (from printing_sources via card_sources)
    const unmatchedGroupKeys = allRows.filter((r) => !r.cardId).map((r) => r.groupKey as string);
    const pendingSourceIdsMap = new Map<string, string[]>();
    if (unmatchedGroupKeys.length > 0) {
      const pendingRows = await db
        .selectFrom("printingSources as ps")
        .innerJoin("cardSources as cs", "cs.id", "ps.cardSourceId")
        .select(["cs.normName as norm", "ps.sourceId"])
        .where("cs.normName", "in", unmatchedGroupKeys)
        .orderBy("ps.sourceId")
        .execute();
      for (const pr of pendingRows) {
        const norm = pr.norm as string;
        const existing = pendingSourceIdsMap.get(norm);
        if (existing) {
          if (!existing.includes(pr.sourceId)) {
            existing.push(pr.sourceId);
          }
        } else {
          pendingSourceIdsMap.set(norm, [pr.sourceId]);
        }
      }
    }

    // Sort by tier (released → known set → unknown set → no printings), then release date, then card slug
    // For candidates without a slug, derive a suggested ID from the first pending source ID
    const suggestedCardIdFor = (r: (typeof allRows)[number]): string | null => {
      if (r.cardSlug) {
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
      const keyA = a.cardSlug ?? suggestedCardIdFor(a);
      const keyB = b.cardSlug ?? suggestedCardIdFor(b);
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
        cardId: r.cardId ?? null,
        cardSlug: r.cardSlug ?? null,
        name: r.name,
        normalizedName: r.cardId ? normalizeNameForMatching(String(r.name)) : r.groupKey,
        sourceIds: r.cardId ? (printingSourceIdsMap.get(r.cardId as string) ?? []) : [],
        pendingSourceIds: r.cardId ? [] : (pendingSourceIdsMap.get(r.groupKey as string) ?? []),
        candidateSourceIds: r.cardId ? (candidateSourceIdsMap.get(r.cardId as string) ?? []) : [],
        sourceCount: Number(r.sourceCount),
        uncheckedCardCount: Number(r.uncheckedCardCount),
        uncheckedPrintingCount: Number(r.uncheckedPrintingCount),
        hasGallery: Boolean(r.hasGallery),
        suggestedCard: r.cardId ? null : (suggestionMap.get(r.groupKey as string) ?? null),
      })),
    );
  })

  // ── GET /export ────────────────────────────────────────────────────────────
  // Export all active cards + printings in the same JSON format the upload endpoint accepts
  .get("/export", async (c) => {
    const db = c.get("db");
    const cards = await db.selectFrom("cards").selectAll().orderBy("name").execute();

    const printings = await db
      .selectFrom("printings")
      .innerJoin("sets", "sets.id", "printings.setId")
      .leftJoin("printingImages", (jb) =>
        jb
          .onRef("printingImages.printingId", "=", "printings.id")
          .on("printingImages.face", "=", "front")
          .on("printingImages.isActive", "=", true),
      )
      .selectAll("printings")
      .select([
        "sets.slug as setSlug",
        "sets.name as setName",
        "printingImages.rehostedUrl",
        "printingImages.originalUrl",
      ])
      .orderBy("printings.setId")
      .orderBy("printings.collectorNumber")
      .orderBy("printings.artVariant")
      .orderBy("printings.finish")
      .execute();

    const printingsByCardId = new Map<string, typeof printings>();
    for (const p of printings) {
      const list = printingsByCardId.get(p.cardId) ?? [];
      list.push(p);
      printingsByCardId.set(p.cardId, list);
    }

    const candidates = cards.map((card) => ({
      card: {
        name: card.name,
        type: card.type,
        super_types: card.superTypes,
        domains: card.domains,
        might: card.might,
        energy: card.energy,
        power: card.power,
        might_bonus: card.mightBonus,
        rules_text: card.rulesText ?? null,
        effect_text: card.effectText ?? null,
        tags: card.tags,
        source_id: card.slug,
        source_entity_id: card.id,
        extra_data: null,
      },
      printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
        source_id: p.sourceId,
        set_id: p.setSlug,
        set_name: p.setName,
        collector_number: p.collectorNumber,
        rarity: p.rarity,
        art_variant: p.artVariant,
        is_signed: p.isSigned,
        finish: p.finish,
        artist: p.artist,
        public_code: p.publicCode,
        printed_rules_text: p.printedRulesText,
        printed_effect_text: p.printedEffectText,
        image_url: p.originalUrl ?? p.rehostedUrl ?? null,
        flavor_text: p.flavorText,
        source_entity_id: p.id,
        extra_data: null,
      })),
    }));

    return c.json(candidates);
  })

  // ── GET /:cardId ──────────────────────────────────────────────────────────
  // Detail: active card + all card_sources + printings + printing_sources
  .get("/:cardId", async (c) => {
    const db = c.get("db");
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
      .selectFrom("cardNameAliases")
      .select("normName")
      .where("cardId", "=", card.id)
      .execute();
    const nameVariants = [cardNormName, ...aliasRows.map((a) => a.normName)];
    const uniqueVariants = [...new Set(nameVariants)];

    // Find sources by name/alias OR by printing source_id match (same fallback as resolveCardId)
    const printingSourceIds = await db
      .selectFrom("printings")
      .select("sourceId")
      .where("cardId", "=", card.id)
      .execute();
    const matchingSourceIds = printingSourceIds.map((p) => p.sourceId);

    let sourcesQuery = db
      .selectFrom("cardSources")
      .selectAll()
      .where("cardSources.normName", "in", uniqueVariants);

    if (matchingSourceIds.length > 0) {
      sourcesQuery = db
        .selectFrom("cardSources")
        .selectAll()
        .where((eb) =>
          eb.or([
            eb("cardSources.normName", "in", uniqueVariants),
            eb.exists(
              eb
                .selectFrom("printingSources as ps_match")
                .select(sql.lit(1).as("x"))
                .whereRef("ps_match.cardSourceId", "=", "cardSources.id")
                .where("ps_match.sourceId", "in", matchingSourceIds),
            ),
          ]),
        );
    }

    const sources = await sourcesQuery.orderBy("source").execute();

    const printings = await db
      .selectFrom("printings")
      .selectAll()
      .where("cardId", "=", card.id)
      .execute();

    const sourceIds = sources.map((s) => s.id);
    const printingSources =
      sourceIds.length > 0
        ? await db
            .selectFrom("printingSources")
            .selectAll()
            .where("cardSourceId", "in", sourceIds)
            .orderBy("setId")
            .orderBy("finish")
            .orderBy("isSigned")
            .orderBy("sourceId")
            .execute()
        : [];

    const printingIds = printings.map((p) => p.id);
    const printingImages =
      printingIds.length > 0
        ? await db
            .selectFrom("printingImages")
            .selectAll()
            .where("printingId", "in", printingIds)
            .orderBy("createdAt", "asc")
            .execute()
        : [];

    // Build set UUID → slug map for printings response
    const setIds = [...new Set(printings.map((p) => p.setId))];
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
        superTypes: card.superTypes,
        domains: card.domains,
        might: card.might,
        energy: card.energy,
        power: card.power,
        mightBonus: card.mightBonus,
        keywords: card.keywords,
        rulesText: card.rulesText,
        effectText: card.effectText,
        tags: card.tags,
      },
      sources: sources.map((s) => ({
        id: s.id,
        source: s.source,
        name: s.name,
        type: s.type,
        superTypes: s.superTypes,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.mightBonus,
        keywords: [
          ...extractKeywords(s.rulesText ?? ""),
          ...extractKeywords(s.effectText ?? ""),
        ].filter((v, i, a) => a.indexOf(v) === i),
        rulesText: s.rulesText,
        effectText: s.effectText,
        tags: s.tags,
        sourceId: s.sourceId,
        sourceEntityId: s.sourceEntityId,
        extraData: s.extraData,
        checkedAt: s.checkedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      printings: printings.map((p) => ({
        id: p.id,
        slug: p.slug,
        cardId: card.id,
        setId: setSlugMap.get(p.setId) ?? p.setId,
        sourceId: p.sourceId,
        collectorNumber: p.collectorNumber,
        rarity: p.rarity,
        artVariant: p.artVariant,
        isSigned: p.isSigned,
        isPromo: p.isPromo,
        finish: p.finish,
        artist: p.artist,
        publicCode: p.publicCode,
        printedRulesText: p.printedRulesText,
        printedEffectText: p.printedEffectText,
        flavorText: p.flavorText,
        comment: p.comment,
      })),
      printingSources: printingSources.map((ps) => ({
        id: ps.id,
        cardSourceId: ps.cardSourceId,
        printingId: ps.printingId,
        sourceId: ps.sourceId,
        setId: ps.setId,
        setName: ps.setName,
        collectorNumber: ps.collectorNumber,
        rarity: ps.rarity,
        artVariant: ps.artVariant,
        isSigned: ps.isSigned,
        isPromo: ps.isPromo,
        finish: ps.finish,
        artist: ps.artist,
        publicCode: ps.publicCode,
        printedRulesText: ps.printedRulesText,
        printedEffectText: ps.printedEffectText,
        imageUrl: ps.imageUrl,
        flavorText: ps.flavorText,
        sourceEntityId: ps.sourceEntityId,
        extraData: ps.extraData,
        checkedAt: ps.checkedAt?.toISOString() ?? null,
        createdAt: ps.createdAt.toISOString(),
        updatedAt: ps.updatedAt.toISOString(),
      })),
      printingImages: printingImages.map((pi) => ({
        id: pi.id,
        printingId: pi.printingId,
        face: pi.face,
        source: pi.source,
        originalUrl: pi.originalUrl,
        rehostedUrl: pi.rehostedUrl,
        isActive: pi.isActive,
        createdAt: pi.createdAt.toISOString(),
        updatedAt: pi.updatedAt.toISOString(),
      })),
    });
  })

  // ── GET /new/:name ────────────────────────────────────────────────────────
  // Unmatched detail: card_sources grouped by normalized name (no matching card)
  .get("/new/:name", async (c) => {
    const db = c.get("db");
    const name = decodeURIComponent(c.req.param("name"));

    const sources = await db
      .selectFrom("cardSources")
      .selectAll()
      .where("cardSources.normName", "=", name)
      .orderBy("source")
      .execute();

    if (sources.length === 0) {
      throw new AppError(404, "NOT_FOUND", "No unmatched sources found for this name");
    }

    const sourceIds = sources.map((s) => s.id);
    const printingSources = await db
      .selectFrom("printingSources")
      .selectAll()
      .where("cardSourceId", "in", sourceIds)
      .orderBy("collectorNumber")
      .orderBy("sourceId")
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
        superTypes: s.superTypes,
        domains: s.domains,
        might: s.might,
        energy: s.energy,
        power: s.power,
        mightBonus: s.mightBonus,
        keywords: [
          ...extractKeywords(s.rulesText ?? ""),
          ...extractKeywords(s.effectText ?? ""),
        ].filter((v, i, a) => a.indexOf(v) === i),
        rulesText: s.rulesText,
        effectText: s.effectText,
        tags: s.tags,
        sourceId: s.sourceId,
        sourceEntityId: s.sourceEntityId,
        extraData: s.extraData,
        checkedAt: s.checkedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      printingSources: printingSources.map((ps) => ({
        id: ps.id,
        cardSourceId: ps.cardSourceId,
        printingId: ps.printingId,
        sourceId: ps.sourceId,
        setId: ps.setId,
        setName: ps.setName,
        collectorNumber: ps.collectorNumber,
        rarity: ps.rarity,
        artVariant: ps.artVariant,
        isSigned: ps.isSigned,
        isPromo: ps.isPromo,
        finish: ps.finish,
        artist: ps.artist,
        publicCode: ps.publicCode,
        printedRulesText: ps.printedRulesText,
        printedEffectText: ps.printedEffectText,
        imageUrl: ps.imageUrl,
        flavorText: ps.flavorText,
        sourceEntityId: ps.sourceEntityId,
        extraData: ps.extraData,
        checkedAt: ps.checkedAt?.toISOString() ?? null,
        createdAt: ps.createdAt.toISOString(),
        updatedAt: ps.updatedAt.toISOString(),
      })),
    });
  });
