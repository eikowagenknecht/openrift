import type {
  CardSourceResponse,
  CardSourceSummaryResponse,
  PrintingSourceGroupResponse,
  PrintingSourceResponse,
} from "@openrift/shared";
import { extractKeywords } from "@openrift/shared/keywords";
import { buildPrintingId, mostCommonValue } from "@openrift/shared/utils";
import type { Selectable } from "kysely";

import type { CardSourcesTable, PrintingSourcesTable } from "../db/index.js";
import type { cardSourcesRepo } from "../repositories/card-sources.js";

type Repo = ReturnType<typeof cardSourcesRepo>;

// ── Shared response-shaping helpers ─────────────────────────────────────────

function formatCardSource(
  s: Pick<
    Selectable<CardSourcesTable>,
    | "id"
    | "source"
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
    | "sourceId"
    | "sourceEntityId"
    | "extraData"
    | "checkedAt"
  >,
): CardSourceResponse {
  return {
    ...s,
    keywords: [
      ...extractKeywords(s.rulesText ?? ""),
      ...extractKeywords(s.effectText ?? ""),
    ].filter((v, i, a) => a.indexOf(v) === i),
    checkedAt: s.checkedAt?.toISOString() ?? null,
  };
}

function formatPrintingSource(
  ps: Pick<
    Selectable<PrintingSourcesTable>,
    | "id"
    | "cardSourceId"
    | "printingId"
    | "sourceId"
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
    | "sourceEntityId"
    | "extraData"
    | "groupKey"
    | "checkedAt"
  >,
): PrintingSourceResponse {
  return {
    ...ps,
    checkedAt: ps.checkedAt?.toISOString() ?? null,
  };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Strip variant suffix from a source ID — e.g. "OGN-001a" → "OGN-001"
 * @returns The source ID with trailing letters/asterisks removed. */
function stripVariantSuffix(sourceId: string): string {
  return sourceId.replace(/(?<=\d)[a-z*]+$/, "");
}

/**
 * Pick the canonical source ID that should become the card slug.
 * Prefers the earliest-released, normal-variant accepted printing.
 * Falls back to first printing source group, then current card slug.
 * @returns The expected card slug derived from source data.
 */
function deriveExpectedCardId(
  printings: {
    sourceId: string;
    setId: string;
    artVariant: string;
    isSigned: boolean;
    promoTypeId: string | null;
    finish: string;
  }[],
  setReleasedAtMap: Map<string, string | null>,
  printingSourceGroups: PrintingSourceGroupResponse[],
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

    return stripVariantSuffix(sorted[0].sourceId);
  }

  if (printingSourceGroups.length > 0) {
    return stripVariantSuffix(printingSourceGroups[0].mostCommonSourceId);
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

export async function buildCardSourceList(repo: Repo): Promise<CardSourceSummaryResponse[]> {
  const [cards, cardSources, printings, printingSources, aliases] = await Promise.all([
    repo.listCardsForSourceList(),
    repo.listCardSourcesForSourceList(),
    repo.listPrintingsForSourceList(),
    repo.listPrintingSourcesForSourceList(),
    repo.listAliasesForSourceList(),
  ]);

  // Accepted printings live on cards — e.g. { cardUUID → ["OGN-001a", "OGN-001b"] }
  const sourceIdsByCardId = new Map<string, string[]>();
  for (const p of printings) {
    let arr = sourceIdsByCardId.get(p.cardId);
    if (!arr) {
      arr = [];
      sourceIdsByCardId.set(p.cardId, arr);
    }
    arr.push(p.sourceId);
  }

  // Card sources from different imports share a normName —
  // e.g. { "fireball" → [cs from gallery, cs from ocr] }
  // cs is an object in the shape: { id, name, normName, source, checkedAt, ... }
  const csGroupsByNormName = new Map<string, typeof cardSources>();
  for (const cs of cardSources) {
    let arr = csGroupsByNormName.get(cs.normName);
    if (!arr) {
      arr = [];
      csGroupsByNormName.set(cs.normName, arr);
    }
    arr.push(cs);
  }

  // Printing sources not yet accepted — e.g. { cardSourceUUID → [{sourceId: "OGN-001a*", checkedAt: null}, ...] }
  const psByCardSourceId = new Map<string, typeof printingSources>();
  for (const ps of printingSources) {
    let arr = psByCardSourceId.get(ps.cardSourceId);
    if (!arr) {
      arr = [];
      psByCardSourceId.set(ps.cardSourceId, arr);
    }
    arr.push(ps);
  }

  // Collects all staging source IDs across a normName group —
  // duplicates are kept so the frontend can show counts (e.g. "OGN-001a* ×2")
  function stagingIdsForGroup(group: typeof cardSources): string[] {
    const ids: string[] = [];
    for (const cs of group) {
      for (const ps of psByCardSourceId.get(cs.id) ?? []) {
        if (!ps.checkedAt) {
          ids.push(ps.sourceId);
        }
      }
    }
    return ids;
  }

  // Count printing sources without checkedAt across a normName group
  function uncheckedPrintingCountForGroup(group: typeof cardSources): number {
    let count = 0;
    for (const cs of group) {
      for (const ps of psByCardSourceId.get(cs.id) ?? []) {
        if (!ps.checkedAt) {
          count++;
        }
      }
    }
    return count;
  }

  // Aliases let a card match card sources under a different name —
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

  // Match card source groups to cards by normName (+ aliases) and delete matched entries —
  // whatever's left in csGroupsByNormName afterwards has no card yet (candidates)
  const results: CardSourceSummaryResponse[] = cards.map((card) => {
    // Collect all card source groups that match this card's name or aliases
    const allGroups: typeof cardSources = [];
    const directGroup = csGroupsByNormName.get(card.normName);
    if (directGroup) {
      allGroups.push(...directGroup);
      csGroupsByNormName.delete(card.normName);
    }
    for (const aliasNorm of aliasNormNamesByCardId.get(card.id) ?? []) {
      const aliasGroup = csGroupsByNormName.get(aliasNorm);
      if (aliasGroup) {
        allGroups.push(...aliasGroup);
        csGroupsByNormName.delete(aliasNorm);
      }
    }
    const group = allGroups.length > 0 ? allGroups : null;
    return {
      cardSlug: card.slug,
      name: card.name,
      normalizedName: card.normName,
      sourceIds: sourceIdsByCardId.get(card.id) ?? [],
      stagingSourceIds: group ? stagingIdsForGroup(group) : [],
      sourceCount: group?.length ?? 0,
      uncheckedCardCount: group?.filter((cs) => !cs.checkedAt).length ?? 0,
      uncheckedPrintingCount: group ? uncheckedPrintingCountForGroup(group) : 0,
      hasGallery: group?.some((cs) => cs.source === "gallery") ?? false,
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

  // Card sources that didn't match any card — these need a card to be created or linked
  for (const [normName, group] of csGroupsByNormName) {
    results.push({
      cardSlug: null,
      name: group[0].name,
      normalizedName: normName,
      sourceIds: [],
      stagingSourceIds: stagingIdsForGroup(group),
      sourceCount: group.length,
      uncheckedCardCount: group.filter((cs) => !cs.checkedAt).length,
      uncheckedPrintingCount: uncheckedPrintingCountForGroup(group),
      hasGallery: group.some((cs) => cs.source === "gallery"),
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
}

// ── GET /:cardId — card detail ──────────────────────────────────────────────

/**
 * Unified detail view — tries slug lookup first, falls back to normName.
 * Both matched (existing card) and unmatched (candidate) use this.
 * @returns Card detail with sources, printings, printing sources, groups, and images.
 */
export async function buildCardSourceDetail(repo: Repo, identifier: string) {
  const card = await repo.cardForDetail(identifier);

  // If matched, look up by card's normName + aliases; otherwise treat identifier as normName
  const aliases = card ? await repo.cardNameAliases(card.id) : [];
  const normNames = aliases.length > 0 ? aliases.map((a) => a.normName) : [identifier];
  const sources = await repo.cardSourcesForDetail(normNames);
  const sourceIds = sources.map((s) => s.id);
  const printingSources =
    sourceIds.length > 0 ? await repo.printingSourcesForDetail(sourceIds) : [];

  // Accepted printings only exist for matched cards
  const printings = card ? await repo.printingsForDetail(card.id) : [];

  // Printings store set as UUID; resolve to slugs for display
  const setIds = [...new Set(printings.map((p) => p.setId))];
  const setRows = setIds.length > 0 ? await repo.setInfoByIds(setIds) : [];
  const setSlugMap = new Map(setRows.map((s) => [s.id, s.slug]));
  const setReleasedAtMap = new Map(setRows.map((s) => [s.id, s.releasedAt]));

  // Resolve promo type IDs → slugs for computing expected printing IDs
  const promoTypeIds = [
    ...new Set(
      [
        ...printings.map((p) => p.promoTypeId),
        ...printingSources.map((ps) => ps.promoTypeId),
      ].filter(Boolean),
    ),
  ] as string[];
  const promoTypeRows = promoTypeIds.length > 0 ? await repo.promoTypeSlugsByIds(promoTypeIds) : [];
  const promoSlugMap = new Map(promoTypeRows.map((pt) => [pt.id, pt.slug]));

  const formattedPrintings = printings.map(({ setId, ...p }) => ({
    ...p,
    setSlug: setSlugMap.get(setId) ?? setId,
    expectedPrintingId: buildPrintingId(
      p.sourceId,
      p.rarity,
      p.promoTypeId ? (promoSlugMap.get(p.promoTypeId) ?? null) : null,
      p.finish,
    ),
  }));

  // Images for accepted printings — used to show thumbnails and manage rehosting
  const printingIds = printings.map((p) => p.id);
  const printingImages =
    printingIds.length > 0 ? await repo.printingImagesForDetail(printingIds) : [];

  // Only group unlinked printing sources — linked ones are already shown under their accepted printing
  const unlinkedPS = printingSources.filter((ps) => !ps.printingId);
  const psGroupMap = new Map<string, typeof unlinkedPS>();
  for (const ps of unlinkedPS) {
    let arr = psGroupMap.get(ps.groupKey);
    if (!arr) {
      arr = [];
      psGroupMap.set(ps.groupKey, arr);
    }
    arr.push(ps);
  }

  // Build one group per distinct printing variant — the UI shows these as rows
  // the admin can accept as new printings or match to existing ones
  const filteredGroups: PrintingSourceGroupResponse[] = [];
  for (const [, groupSources] of psGroupMap) {
    // All sources in a group share the same variant traits; use the first as representative
    const first = groupSources[0];
    const mcSourceId = mostCommonValue(groupSources.map((s) => s.sourceId));
    const rarity = first.rarity ?? "";
    const finish = resolveFinish(first.finish, first.rarity);
    const promoTypeSlug = first.promoTypeId ? (promoSlugMap.get(first.promoTypeId) ?? null) : null;

    filteredGroups.push({
      mostCommonSourceId: mcSourceId,
      sourceIds: groupSources.map((s) => s.id),
      expectedPrintingId: buildPrintingId(mcSourceId, rarity, promoTypeSlug, finish),
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
    // Card name if matched, shortest source name if unmatched (sources may have slight name variations)
    displayName: card
      ? card.name
      : sources.length > 0
        ? sources.reduce(
            (best, s) => (s.name.length < best.length ? s.name : best),
            sources[0].name,
          )
        : identifier,
    sources: sources.map((s) => formatCardSource(s)),
    printings: formattedPrintings.sort((a, b) =>
      a.expectedPrintingId.localeCompare(b.expectedPrintingId),
    ),
    printingSources: printingSources.map((ps) => formatPrintingSource(ps)),
    printingSourceGroups: filteredGroups,
    expectedCardId: deriveExpectedCardId(printings, setReleasedAtMap, filteredGroups, card?.slug),
    printingImages,
  };
}

/** @deprecated Use buildCardSourceDetail which handles both matched and unmatched.
 * @returns Unmatched detail reshaped from buildCardSourceDetail. */
export async function buildUnmatchedDetail(repo: Repo, normName: string) {
  const result = await buildCardSourceDetail(repo, normName);
  return {
    displayName: result.displayName,
    sources: result.sources,
    printingSources: result.printingSources,
    printingSourceGroups: result.printingSourceGroups,
    defaultCardId: result.expectedCardId,
  };
}
