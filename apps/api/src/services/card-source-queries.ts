import { extractKeywords } from "@openrift/shared/keywords";
import { normalizeNameForMatching } from "@openrift/shared/utils";
import type { Selectable } from "kysely";

import type { CardSourcesTable, PrintingSourcesTable } from "../db/index.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import { AppError } from "../errors.js";
import type { cardSourcesRepo } from "../repositories/card-sources.js";

type Repo = ReturnType<typeof cardSourcesRepo>;

// ── Shared response-shaping helpers ─────────────────────────────────────────

function formatCardSource(s: Selectable<CardSourcesTable>) {
  return {
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
  };
}

function formatPrintingSource(ps: Selectable<PrintingSourcesTable>) {
  return {
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
    promoTypeId: ps.promoTypeId,
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
  };
}

// ── GET / — card source list ────────────────────────────────────────────────

interface ListRow {
  cardId: string | null;
  cardSlug: string | null;
  name: string;
  groupKey: string;
  sourceCount: number;
  uncheckedCardCount: number;
  uncheckedPrintingCount: number;
  hasGallery: boolean;
  minReleasedAt: string | null;
  releasedSetSlug: string | null;
  hasKnownSet: boolean;
  hasUnknownSet: boolean;
  _fromCard?: boolean;
}

/**
 * Orchestrates the GET / endpoint: fetches grouped sources, orphan cards,
 * suggestions, source IDs, then sorts and shapes the response.
 * @returns Sorted card source list items shaped for the JSON response.
 */
export async function buildCardSourceList(
  repo: Repo,
  filter: string,
  source?: string,
  set?: string,
) {
  const rows = await repo.listGroupedSources(filter, source, set);

  const allRows: ListRow[] = [...rows];

  // Include cards that have no card_sources (unless filtering for unmatched/source)
  if (filter !== "unmatched" && !source) {
    const cardIdsWithSources = new Set(rows.filter((r) => r.cardId).map((r) => r.cardId as string));
    const orphanCards = await repo.listOrphanCards([...cardIdsWithSources], set);

    for (const oc of orphanCards) {
      allRows.push({
        cardId: oc.id,
        cardSlug: oc.slug,
        name: oc.name,
        groupKey: oc.id,
        sourceCount: 0,
        uncheckedCardCount: 0,
        uncheckedPrintingCount: 0,
        hasGallery: false,
        minReleasedAt: null,
        releasedSetSlug: null,
        hasKnownSet: false,
        hasUnknownSet: false,
        _fromCard: true,
      });
    }

    // Fetch set release info for orphan cards via their printings
    const orphanIds = orphanCards.map((oc) => oc.id);
    if (orphanIds.length > 0) {
      const orphanPrintings = await repo.listOrphanPrintingSetInfo(orphanIds);
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
          row.hasKnownSet = true;
        }
      }
    }
  }

  // Compute dynamic match suggestions for unmatched groups
  const unmatchedNormNames = allRows.filter((r) => !r.cardId).map((r) => r.groupKey as string);

  const suggestionMap = new Map<string, { id: string; slug: string; name: string }>();
  if (unmatchedNormNames.length > 0) {
    const suggestions = await repo.listSuggestionsByNormName(unmatchedNormNames);
    for (const s of suggestions) {
      suggestionMap.set(s.norm, { id: s.id, slug: s.slug, name: s.name });
    }

    // Also check aliases for matches not covered by direct card name
    const missingNorms = unmatchedNormNames.filter((n) => !suggestionMap.has(n));
    if (missingNorms.length > 0) {
      const aliasSuggestions = await repo.listAliasSuggestions(missingNorms);
      for (const s of aliasSuggestions) {
        if (!suggestionMap.has(s.norm)) {
          suggestionMap.set(s.norm, { id: s.id, slug: s.slug, name: s.name });
        }
      }
    }
  }

  // Load printing source IDs for matched cards
  const matchedCardIds = allRows.filter((r) => r.cardId).map((r) => r.cardId as string);
  const printingSourceIdsMap = new Map<string, string[]>();
  if (matchedCardIds.length > 0) {
    const printingRows = await repo.listPrintingSourceIds(matchedCardIds);
    for (const pr of printingRows) {
      const existing = printingSourceIdsMap.get(pr.cardId);
      if (existing) {
        existing.push(pr.sourceId);
      } else {
        printingSourceIdsMap.set(pr.cardId, [pr.sourceId]);
      }
    }
  }

  // Find cards with printings missing an active front image
  const missingImageCardIds = new Set<string>();
  if (matchedCardIds.length > 0) {
    const missingRows = await repo.listCardIdsWithMissingImages(matchedCardIds);
    for (const mr of missingRows) {
      missingImageCardIds.add(mr.cardId);
    }
  }

  // Load candidate printing source IDs for matched cards (printing_sources with no printing_id yet)
  const candidateSourceIdsMap = new Map<string, string[]>();
  if (matchedCardIds.length > 0) {
    const matchedNormNames = allRows
      .filter((r) => r.cardId)
      .map((r) => normalizeNameForMatching(String(r.name)));
    const candidateRows = await repo.listCandidateSourceIds(matchedNormNames);
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

  // Load printing source IDs for unmatched cards
  const unmatchedGroupKeys = allRows.filter((r) => !r.cardId).map((r) => r.groupKey as string);
  const pendingSourceIdsMap = new Map<string, string[]>();
  if (unmatchedGroupKeys.length > 0) {
    const pendingRows = await repo.listPendingSourceIds(unmatchedGroupKeys);
    for (const pr of pendingRows) {
      const norm = pr.norm;
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
  const suggestedCardIdFor = (r: ListRow): string | null => {
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
    function tier(r: ListRow): number {
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

  return allRows.map((r) => ({
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
    hasMissingImage: r.cardId ? missingImageCardIds.has(r.cardId) : false,
    suggestedCard: r.cardId ? null : (suggestionMap.get(r.groupKey as string) ?? null),
  }));
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
 * Orchestrates the GET /:cardId endpoint: loads card, sources, printings, images.
 * @returns Full card source detail with sources, printings, printing sources, and images.
 */
export async function buildCardSourceDetail(repo: Repo, slug: string) {
  const card = await repo.cardBySlug(slug);
  if (!card) {
    throw new AppError(404, "NOT_FOUND", "Card not found");
  }

  // Find sources matched by card name or alias
  const cardNormName = normalizeNameForMatching(card.name);
  const aliasRows = await repo.cardNameAliases(card.id);
  const nameVariants = [cardNormName, ...aliasRows.map((a) => a.normName)];
  const uniqueVariants = [...new Set(nameVariants)];

  // Find sources by name/alias OR by printing source_id match
  const printingSourceIdRows = await repo.printingSourceIdsForCard(card.id);
  const matchingSourceIds = printingSourceIdRows.map((p) => p.sourceId);

  const sources =
    matchingSourceIds.length > 0
      ? await repo.cardSourcesByNormNamesOrPrintingSourceIds(uniqueVariants, matchingSourceIds)
      : await repo.cardSourcesByNormNames(uniqueVariants);

  const printings = await repo.printingsForCard(card.id);

  const sourceIds = sources.map((s) => s.id);
  const printingSources = await repo.printingSourcesForCardSources(sourceIds);

  const printingIds = printings.map((p) => p.id);
  const printingImages = await repo.printingImagesForPrintings(printingIds);

  // Build set UUID → slug map for printings response
  const setIds = [...new Set(printings.map((p) => p.setId))];
  const setRows = await repo.setSlugsByIds(setIds);
  const setSlugMap = new Map(setRows.map((s) => [s.id, s.slug]));

  return {
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
    sources: sources.map((s) => formatCardSource(s)),
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
      promoTypeId: p.promoTypeId,
      promoTypeSlug: p.promoTypeSlug,
      finish: p.finish,
      artist: p.artist,
      publicCode: p.publicCode,
      printedRulesText: p.printedRulesText,
      printedEffectText: p.printedEffectText,
      flavorText: p.flavorText,
      comment: p.comment,
    })),
    printingSources: printingSources.map((ps) => formatPrintingSource(ps)),
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
  };
}

// ── GET /new/:name — unmatched detail ───────────────────────────────────────

/**
 * Orchestrates the GET /new/:name endpoint: loads unmatched sources and printing sources.
 * @returns Unmatched detail with display name, sources, and printing sources.
 */
export async function buildUnmatchedDetail(repo: Repo, normName: string) {
  const sources = await repo.cardSourcesByNormName(normName);

  if (sources.length === 0) {
    throw new AppError(404, "NOT_FOUND", "No unmatched sources found for this name");
  }

  const sourceIds = sources.map((s) => s.id);
  const printingSources = await repo.printingSourcesForUnmatched(sourceIds);

  // Use the shortest raw name from the group as the display name
  const displayName = sources.reduce(
    (best, s) => (s.name.length < best.length ? s.name : best),
    sources[0].name,
  );

  return {
    name: displayName,
    sources: sources.map((s) => formatCardSource(s)),
    printingSources: printingSources.map((ps) => formatPrintingSource(ps)),
  };
}
