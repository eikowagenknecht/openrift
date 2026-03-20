import type {
  CandidateCardResponse,
  CandidateCardSummaryResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
} from "@openrift/shared";
import { buildPrintingId, mostCommonValue } from "@openrift/shared/utils";
import type { Selectable } from "kysely";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";
import { AppError } from "../errors.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";

type Repo = ReturnType<typeof candidateCardsRepo>;

// ── Shared response-shaping helpers ─────────────────────────────────────────

function formatCandidateCard(
  s: Pick<
    Selectable<CandidateCardsTable>,
    | "id"
    | "provider"
    | "name"
    | "type"
    | "superTypes"
    | "domains"
    | "might"
    | "energy"
    | "power"
    | "mightBonus"
    | "rulesText"
    | "effectText"
    | "tags"
    | "shortCode"
    | "externalId"
    | "extraData"
    | "checkedAt"
  >,
): CandidateCardResponse {
  return {
    ...s,
    checkedAt: s.checkedAt?.toISOString() ?? null,
  };
}

function formatCandidatePrinting(
  ps: Pick<
    Selectable<CandidatePrintingsTable>,
    | "id"
    | "candidateCardId"
    | "printingId"
    | "shortCode"
    | "setId"
    | "setName"
    | "collectorNumber"
    | "rarity"
    | "artVariant"
    | "isSigned"
    | "promoTypeId"
    | "finish"
    | "artist"
    | "publicCode"
    | "printedRulesText"
    | "printedEffectText"
    | "imageUrl"
    | "flavorText"
    | "externalId"
    | "extraData"
    | "groupKey"
    | "checkedAt"
  >,
): CandidatePrintingResponse {
  return {
    ...ps,
    checkedAt: ps.checkedAt?.toISOString() ?? null,
  };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Strip variant suffix from a short code — e.g. "OGN-001a" → "OGN-001"
 * @returns The short code with trailing letters/asterisks removed. */
function stripVariantSuffix(shortCode: string): string {
  return shortCode.replace(/(?<=\d)[a-z*]+$/, "");
}

/**
 * Pick the canonical short code that should become the card slug.
 * Prefers the earliest-released, normal-variant accepted printing.
 * Falls back to first candidate printing group, then current card slug.
 * @returns The expected card slug derived from candidate data.
 */
function deriveExpectedCardId(
  printings: {
    shortCode: string;
    setId: string;
    artVariant: string;
    isSigned: boolean;
    promoTypeId: string | null;
    finish: string;
  }[],
  setReleasedAtMap: Map<string, string | null>,
  candidatePrintingGroups: CandidatePrintingGroupResponse[],
  currentSlug?: string,
): string {
  if (printings.length > 0) {
    // Filter to "normal" printings — not alternate art, not signed, no promo
    const normalPrintings = printings.filter(
      (p) =>
        (p.artVariant === "normal" || !p.artVariant) &&
        !p.isSigned &&
        !p.promoTypeId &&
        p.finish === "normal",
    );

    const candidates = normalPrintings.length > 0 ? normalPrintings : printings;

    // Sort by release date ascending (nulls last)
    const sorted = [...candidates].sort((a, b) => {
      const dateA = setReleasedAtMap.get(a.setId) ?? "";
      const dateB = setReleasedAtMap.get(b.setId) ?? "";
      if (dateA && !dateB) {
        return -1;
      }
      if (!dateA && dateB) {
        return 1;
      }
      return dateA.localeCompare(dateB);
    });

    return stripVariantSuffix(sorted[0].shortCode);
  }

  if (candidatePrintingGroups.length > 0) {
    return stripVariantSuffix(candidatePrintingGroups[0].mostCommonShortCode);
  }

  return currentSlug ?? "";
}

/** Resolve null finish based on rarity: Common/Uncommon default to "normal", others to "foil".
 * @returns The resolved finish string. */
function resolveFinish(finish: string | null, rarity: string | null): string {
  if (finish) {
    return finish;
  }
  if (!rarity) {
    return "";
  }
  return rarity === "Common" || rarity === "Uncommon" ? "normal" : "foil";
}

export async function buildCandidateCardList(repo: Repo): Promise<CandidateCardSummaryResponse[]> {
  const [cards, candidateCards, printings, candidatePrintings, aliases] = await Promise.all([
    repo.listCardsForSourceList(),
    repo.listCandidateCardsForSourceList(),
    repo.listPrintingsForSourceList(),
    repo.listCandidatePrintingsForSourceList(),
    repo.listAliasesForSourceList(),
  ]);

  // Accepted printings live on cards — e.g. { cardUUID → ["OGN-001a", "OGN-001b"] }
  const shortCodesByCardId = new Map<string, string[]>();
  for (const p of printings) {
    let arr = shortCodesByCardId.get(p.cardId);
    if (!arr) {
      arr = [];
      shortCodesByCardId.set(p.cardId, arr);
    }
    arr.push(p.shortCode);
  }

  // Candidate cards from different imports share a normName —
  // e.g. { "fireball" → [cc from gallery, cc from ocr] }
  // cc is an object in the shape: { id, name, normName, provider, checkedAt, ... }
  const ccGroupsByNormName = new Map<string, typeof candidateCards>();
  for (const cc of candidateCards) {
    let arr = ccGroupsByNormName.get(cc.normName);
    if (!arr) {
      arr = [];
      ccGroupsByNormName.set(cc.normName, arr);
    }
    arr.push(cc);
  }

  // Candidate printings not yet accepted — e.g. { candidateCardUUID → [{shortCode: "OGN-001a*", checkedAt: null}, ...] }
  const cpByCandidateCardId = new Map<string, typeof candidatePrintings>();
  for (const cp of candidatePrintings) {
    let arr = cpByCandidateCardId.get(cp.candidateCardId);
    if (!arr) {
      arr = [];
      cpByCandidateCardId.set(cp.candidateCardId, arr);
    }
    arr.push(cp);
  }

  // Collects all staging short codes across a normName group —
  // duplicates are kept so the frontend can show counts (e.g. "OGN-001a* ×2")
  function stagingIdsForGroup(group: typeof candidateCards): string[] {
    const ids: string[] = [];
    for (const cc of group) {
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (!cp.checkedAt) {
          ids.push(cp.shortCode);
        }
      }
    }
    return ids;
  }

  // Count candidate printings without checkedAt across a normName group
  function uncheckedPrintingCountForGroup(group: typeof candidateCards): number {
    let count = 0;
    for (const cc of group) {
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (!cp.checkedAt) {
          count++;
        }
      }
    }
    return count;
  }

  // Aliases let a card match candidate cards under a different name —
  // e.g. card "Fireball" (normName "fireball") has alias "firbal" so it also claims that group
  const aliasNormNamesByCardId = new Map<string, string[]>();
  for (const a of aliases) {
    let arr = aliasNormNamesByCardId.get(a.cardId);
    if (!arr) {
      arr = [];
      aliasNormNamesByCardId.set(a.cardId, arr);
    }
    arr.push(a.normName);
  }

  // Match candidate card groups to cards by normName (+ aliases) and delete matched entries —
  // whatever's left in ccGroupsByNormName afterwards has no card yet (candidates)
  const results: CandidateCardSummaryResponse[] = cards.map((card) => {
    // Collect all candidate card groups that match this card's name or aliases
    const allGroups: typeof candidateCards = [];
    const directGroup = ccGroupsByNormName.get(card.normName);
    if (directGroup) {
      allGroups.push(...directGroup);
      ccGroupsByNormName.delete(card.normName);
    }
    for (const aliasNorm of aliasNormNamesByCardId.get(card.id) ?? []) {
      const aliasGroup = ccGroupsByNormName.get(aliasNorm);
      if (aliasGroup) {
        allGroups.push(...aliasGroup);
        ccGroupsByNormName.delete(aliasNorm);
      }
    }
    const group = allGroups.length > 0 ? allGroups : null;
    return {
      cardSlug: card.slug,
      name: card.name,
      normalizedName: card.normName,
      shortCodes: shortCodesByCardId.get(card.id) ?? [],
      stagingShortCodes: group ? stagingIdsForGroup(group) : [],
      candidateCount: group?.length ?? 0,
      uncheckedCardCount: group?.filter((cc) => !cc.checkedAt).length ?? 0,
      uncheckedPrintingCount: group ? uncheckedPrintingCountForGroup(group) : 0,
      hasGallery: group?.some((cc) => cc.provider === "gallery") ?? false,
      suggestedCardSlug: null,
    };
  });

  // For unmatched rows, suggest a card whose normName is the longest prefix —
  // e.g. "yoneblademaster" is a prefix of "yoneblademasterovernumbered"
  function findSuggestedCard(normName: string): string | null {
    let bestSlug: string | null = null;
    let bestLen = 0;
    for (const card of cards) {
      if (normName.startsWith(card.normName) && card.normName.length > bestLen) {
        bestSlug = card.slug;
        bestLen = card.normName.length;
      }
    }
    return bestSlug;
  }

  // Candidate cards that didn't match any card — these need a card to be created or linked
  for (const [normName, group] of ccGroupsByNormName) {
    results.push({
      cardSlug: null,
      name: group[0].name,
      normalizedName: normName,
      shortCodes: [],
      stagingShortCodes: stagingIdsForGroup(group),
      candidateCount: group.length,
      uncheckedCardCount: group.filter((cc) => !cc.checkedAt).length,
      uncheckedPrintingCount: uncheckedPrintingCountForGroup(group),
      hasGallery: group.some((cc) => cc.provider === "gallery"),
      suggestedCardSlug: findSuggestedCard(normName),
    });
  }

  return results;
}

// ── GET /export ─────────────────────────────────────────────────────────────

/**
 * Orchestrates the GET /export endpoint: loads all cards + printings, shapes response.
 * @returns Export-format card + printing objects.
 */
export async function buildExport(repo: Repo) {
  const [cards, printings] = await Promise.all([repo.exportCards(), repo.exportPrintings()]);

  const printingsByCardId = new Map<string, typeof printings>();
  for (const p of printings) {
    const list = printingsByCardId.get(p.cardId) ?? [];
    list.push(p);
    printingsByCardId.set(p.cardId, list);
  }

  return cards.map((card) => ({
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
      short_code: card.slug,
      external_id: card.id,
      extra_data: null,
    },
    printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
      short_code: p.shortCode,
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
      external_id: p.id,
      extra_data: null,
    })),
  }));
}

// ── GET /:cardId — card detail ──────────────────────────────────────────────

/**
 * Unified detail view — tries slug lookup first, falls back to normName.
 * Both matched (existing card) and unmatched (candidate) use this.
 * @returns Card detail with candidates, printings, candidate printings, groups, and images.
 */
export async function buildCandidateCardDetail(repo: Repo, identifier: string) {
  const card = await repo.cardForDetail(identifier);

  // If matched, look up by card's normName + aliases; otherwise treat identifier as normName
  const aliases = card ? await repo.cardNameAliases(card.id) : [];
  if (card && aliases.length === 0) {
    throw new AppError(
      500,
      "MISSING_ALIAS",
      `Card "${card.slug}" has no name aliases — this should never happen. Re-create the alias to fix.`,
    );
  }
  const normNames = aliases.length > 0 ? aliases.map((a) => a.normName) : [identifier];
  const candidates = await repo.candidateCardsForDetail(normNames);
  const candidateIds = candidates.map((s) => s.id);
  const candidatePrintings =
    candidateIds.length > 0 ? await repo.candidatePrintingsForDetail(candidateIds) : [];

  // Accepted printings only exist for matched cards
  const printings = card ? await repo.printingsForDetail(card.id) : [];

  // Printings store set as UUID; resolve to slugs for display
  const setIds = [...new Set(printings.map((p) => p.setId))];
  const setRows = setIds.length > 0 ? await repo.setInfoByIds(setIds) : [];
  const setSlugMap = new Map(setRows.map((s) => [s.id, s.slug]));
  const setNameMap = new Map(setRows.map((s) => [s.id, s.name]));
  const setReleasedAtMap = new Map(setRows.map((s) => [s.id, s.releasedAt]));

  // Resolve promo type IDs → slugs for computing expected printing IDs
  const promoTypeIds = [
    ...new Set(
      [
        ...printings.map((p) => p.promoTypeId),
        ...candidatePrintings.map((cp) => cp.promoTypeId),
      ].filter(Boolean),
    ),
  ] as string[];
  const promoTypeRows = promoTypeIds.length > 0 ? await repo.promoTypeSlugsByIds(promoTypeIds) : [];
  const promoSlugMap = new Map(promoTypeRows.map((pt) => [pt.id, pt.slug]));

  const formattedPrintings = printings.map(({ setId, ...p }) => ({
    ...p,
    setId: setSlugMap.get(setId) ?? setId,
    setName: setNameMap.get(setId) ?? null,
    setSlug: setSlugMap.get(setId) ?? setId,
    expectedPrintingId: buildPrintingId(
      p.shortCode,
      p.rarity,
      p.promoTypeId ? (promoSlugMap.get(p.promoTypeId) ?? null) : null,
      p.finish,
    ),
  }));

  // Images for accepted printings — used to show thumbnails and manage rehosting
  const printingIds = printings.map((p) => p.id);
  const printingImages =
    printingIds.length > 0 ? await repo.printingImagesForDetail(printingIds) : [];

  // Only group unlinked candidate printings — linked ones are already shown under their accepted printing
  const unlinkedCP = candidatePrintings.filter((cp) => !cp.printingId);
  const cpGroupMap = new Map<string, typeof unlinkedCP>();
  for (const cp of unlinkedCP) {
    let arr = cpGroupMap.get(cp.groupKey);
    if (!arr) {
      arr = [];
      cpGroupMap.set(cp.groupKey, arr);
    }
    arr.push(cp);
  }

  // Build one group per distinct printing variant — the UI shows these as rows
  // the admin can accept as new printings or match to existing ones
  const filteredGroups: CandidatePrintingGroupResponse[] = [];
  for (const [, groupCandidates] of cpGroupMap) {
    // All candidates in a group share the same variant traits; use the first as representative
    const first = groupCandidates[0];
    const mcShortCode = mostCommonValue(groupCandidates.map((s) => s.shortCode));
    const rarity = first.rarity ?? "";
    const finish = resolveFinish(first.finish, first.rarity);
    const promoTypeSlug = first.promoTypeId ? (promoSlugMap.get(first.promoTypeId) ?? null) : null;

    filteredGroups.push({
      mostCommonShortCode: mcShortCode,
      shortCodes: groupCandidates.map((s) => s.id),
      expectedPrintingId: buildPrintingId(mcShortCode, rarity, promoTypeSlug, finish),
    });
  }

  return {
    card: card
      ? {
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
        }
      : null,
    // Card name if matched, shortest candidate name if unmatched (candidates may have slight name variations)
    displayName: card
      ? card.name
      : candidates.length > 0
        ? candidates.reduce(
            (best, s) => (s.name.length < best.length ? s.name : best),
            candidates[0].name,
          )
        : identifier,
    sources: candidates.map((s) => formatCandidateCard(s)),
    printings: formattedPrintings.sort((a, b) =>
      a.expectedPrintingId.localeCompare(b.expectedPrintingId),
    ),
    candidatePrintings: candidatePrintings.map((cp) => formatCandidatePrinting(cp)),
    candidatePrintingGroups: filteredGroups,
    expectedCardId: deriveExpectedCardId(printings, setReleasedAtMap, filteredGroups, card?.slug),
    printingImages,
  };
}

/** @deprecated Use buildCandidateCardDetail which handles both matched and unmatched.
 * @returns Unmatched detail reshaped from buildCandidateCardDetail. */
export async function buildUnmatchedDetail(repo: Repo, normName: string) {
  const result = await buildCandidateCardDetail(repo, normName);
  return {
    displayName: result.displayName,
    sources: result.sources,
    candidatePrintings: result.candidatePrintings,
    candidatePrintingGroups: result.candidatePrintingGroups,
    defaultCardId: result.expectedCardId,
  };
}
