import type { Context } from "hono";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { db } from "../db.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../types.js";

// GET /candidates
export async function handleList(c: Context<{ Variables: Variables }>) {
  const tab = c.req.query("tab") ?? "new";
  const status = c.req.query("status") ?? "pending";

  const baseQuery = db
    .selectFrom("candidate_cards")
    .selectAll("candidate_cards")
    .where("candidate_cards.status", "=", status);

  const query =
    tab === "new"
      ? baseQuery.where("candidate_cards.match_card_id", "is", null)
      : baseQuery.where("candidate_cards.match_card_id", "is not", null);

  const rows = await query.orderBy("candidate_cards.created_at", "desc").execute();

  // Load printings for all candidates
  const candidateIds = rows.map((r) => r.id);
  const printings =
    candidateIds.length > 0
      ? await db
          .selectFrom("candidate_printings")
          .selectAll()
          .where("candidate_card_id", "in", candidateIds)
          .execute()
      : [];

  const printingsByCandidate = new Map<string, typeof printings>();
  for (const p of printings) {
    const list = printingsByCandidate.get(p.candidate_card_id) ?? [];
    list.push(p);
    printingsByCandidate.set(p.candidate_card_id, list);
  }

  // For updates tab, load matched cards
  const matchedCardIds = rows.map((r) => r.match_card_id).filter((id): id is string => id !== null);
  const matchedCards =
    matchedCardIds.length > 0
      ? await db
          .selectFrom("cards")
          .select(["id", "name"])
          .where("id", "in", matchedCardIds)
          .execute()
      : [];
  const matchedCardMap = new Map(matchedCards.map((r) => [r.id, r]));

  const result = rows.map((row) => ({
    id: row.id,
    status: row.status,
    source: row.source,
    matchCardId: row.match_card_id,
    sourceId: row.source_id,
    name: row.name,
    type: row.type,
    superTypes: row.super_types,
    domains: row.domains,
    might: row.might,
    energy: row.energy,
    power: row.power,
    mightBonus: row.might_bonus,
    keywords: row.keywords,
    rulesText: row.rules_text,
    effectText: row.effect_text,
    tags: row.tags,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by,
    printings: (printingsByCandidate.get(row.id) ?? []).map((p) => ({
      id: p.id,
      sourceId: p.source_id,
      setId: p.set_id,
      setName: p.set_name,
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
      imageUrl: p.image_url,
    })),
    matchedCard: row.match_card_id ? (matchedCardMap.get(row.match_card_id) ?? null) : null,
  }));

  return c.json(result);
}
