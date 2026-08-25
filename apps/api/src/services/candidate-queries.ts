import type {
  AdminMarketplaceName,
  AdminPrintingMarketplaceMappingResponse,
  CandidateCardResponse,
  CandidateCardSummaryResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
} from "@openrift/shared";
import { WellKnown, ERROR_CODES } from "@openrift/shared";
import { USER_SUBMISSION_PROVIDER } from "@openrift/shared/contracts/card-submissions";
import { formatPrintingLabel, mostCommonValue, slugifyName } from "@openrift/shared/utils";
import type { Selectable } from "kysely";

import type { CandidateCardsTable, CandidatePrintingsTable } from "../db/index.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias
import { AppError } from "../errors.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { marketplaceMappingRepo } from "../repositories/marketplace-mapping.js";

type Repo = ReturnType<typeof candidateCardsRepo>;
type MarketplaceMappingRepo = ReturnType<typeof marketplaceMappingRepo>;

/** Near-miss printing suggestion weights — see `findSuggestedPrinting`. A stated
 *  marker is the strongest signal, so a printing missing one outranks a finish
 *  mismatch: sources mis-report finish constantly (a foil-only promo listed as
 *  normal) but rarely invent a marker. An extra marker beyond what the source
 *  declared is the cheapest miss, because sources under-report them. */
const MISSING_MARKER_COST = 1000;
const FINISH_MISMATCH_COST = 100;
const EXTRA_MARKER_COST = 1;

function toMarketplaceName(marketplace: string): AdminMarketplaceName | null {
  if (marketplace === "tcgplayer" || marketplace === "cardmarket" || marketplace === "cardtrader") {
    return marketplace;
  }
  return null;
}

function formatCandidateCard(
  s: Pick<
    Selectable<CandidateCardsTable>,
    | "id"
    | "provider"
    | "name"
    | "types"
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
    | "submittedByUserId"
    | "submissionNote"
  > & { submittedByName: string | null },
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
    | "rarity"
    | "artVariant"
    | "isSigned"
    | "markerSlugs"
    | "distributionChannelSlugs"
    | "finish"
    | "size"
    | "artist"
    | "publicCode"
    | "printedRulesText"
    | "printedEffectText"
    | "imageUrl"
    | "flavorText"
    | "language"
    | "printedName"
    | "printedYear"
    | "externalId"
    | "extraData"
    | "checkedAt"
  >,
): CandidatePrintingResponse {
  return {
    ...ps,
    checkedAt: ps.checkedAt?.toISOString() ?? null,
  };
}

function deriveExpectedCardId(displayName: string, currentSlug?: string): string {
  if (displayName) {
    return slugifyName(displayName);
  }
  return currentSlug ?? "";
}

function resolveFinish(finish: string | null, rarity: string | null): string {
  if (finish) {
    return finish;
  }
  if (!rarity) {
    return "";
  }
  return rarity === WellKnown.rarity.COMMON || rarity === WellKnown.rarity.UNCOMMON
    ? WellKnown.finish.NORMAL
    : WellKnown.finish.FOIL;
}

export async function buildCandidateCardList(
  repo: Repo,
  favoriteProviders: Set<string>,
  allowedProviders: Set<string> | null = null,
): Promise<CandidateCardSummaryResponse[]> {
  const [cards, allCandidateCards, printings, candidatePrintings, aliases] = await Promise.all([
    repo.listCardsForSourceList(),
    repo.listCandidateCardsForSourceList(),
    repo.listPrintingsForSourceList(),
    repo.listCandidatePrintingsForSourceList(),
    repo.listAliasesForSourceList(),
  ]);

  // card-review grant holders only see candidates from allowed providers
  // (null = full admin, unscoped). Filtering here keeps every derived
  // structure (groups, staging codes, counts) consistent for free.
  const candidateCards =
    allowedProviders === null
      ? allCandidateCards
      : allCandidateCards.filter((cc) => allowedProviders.has(cc.provider));

  const shortCodesByCardId = new Map<string, string[]>();
  const setSlugsByCardId = new Map<string, Set<string>>();
  for (const p of printings) {
    let arr = shortCodesByCardId.get(p.cardId);
    if (!arr) {
      arr = [];
      shortCodesByCardId.set(p.cardId, arr);
    }
    const label =
      p.language === WellKnown.language.EN ? p.shortCode : `${p.shortCode} [${p.language}]`;
    arr.push(label);
    if (p.setSlug) {
      let slugs = setSlugsByCardId.get(p.cardId);
      if (!slugs) {
        slugs = new Set();
        setSlugsByCardId.set(p.cardId, slugs);
      }
      slugs.add(p.setSlug);
    }
  }

  // A name made only of punctuation or symbols normalizes to `""`, which as a
  // grouping key would merge every such candidate into one row. Those rows are
  // unmatchable — there is no key to look a card up by — so they are grouped
  // by raw name instead and surfaced individually. The `\u0000` prefix
  // cannot collide with a real normName, which only ever holds letters and digits.
  const ccGroupsByNormName = new Map<string, typeof candidateCards>();
  for (const cc of candidateCards) {
    const groupKey = cc.normName === "" ? `\u0000name:${cc.name}` : cc.normName;
    let arr = ccGroupsByNormName.get(groupKey);
    if (!arr) {
      arr = [];
      ccGroupsByNormName.set(groupKey, arr);
    }
    arr.push(cc);
  }

  // orderIndex is the row's position in the repo result (canonical printing
  // order), so codes merged across a group's candidate cards can be re-sorted
  // globally instead of coming out grouped by provider.
  const cpByCandidateCardId = new Map<
    string,
    ((typeof candidatePrintings)[number] & { orderIndex: number })[]
  >();
  for (const [orderIndex, cp] of candidatePrintings.entries()) {
    let arr = cpByCandidateCardId.get(cp.candidateCardId);
    if (!arr) {
      arr = [];
      cpByCandidateCardId.set(cp.candidateCardId, arr);
    }
    arr.push({ ...cp, orderIndex });
  }

  // Duplicates are kept so the frontend can show counts (e.g. "OGN-001a* ×2").
  // Linked candidate printings are skipped — they're already resolved to an
  // accepted printing.
  function stagingIdsForGroup(group: typeof candidateCards, onlyFavorites?: boolean): string[] {
    const entries: { label: string; orderIndex: number }[] = [];
    for (const cc of group) {
      if (onlyFavorites && !favoriteProviders.has(cc.provider)) {
        continue;
      }
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (!cp.checkedAt && !cp.printingId) {
          const label =
            !cp.language || cp.language === WellKnown.language.EN
              ? cp.shortCode
              : `${cp.shortCode} [${cp.language}]`;
          entries.push({ label, orderIndex: cp.orderIndex });
        }
      }
    }
    return entries.toSorted((a, b) => a.orderIndex - b.orderIndex).map((e) => e.label);
  }

  // Distinct set slugs across a group's candidate printings. For candidate
  // printings `setId` holds the slug directly (unlike accepted printings, which
  // store a UUID), so no resolution is needed. Includes every candidate printing
  // so a not-yet-accepted new-set reprint still surfaces under that set's filter.
  function candidateSetSlugsForGroup(group: typeof candidateCards): string[] {
    const slugs = new Set<string>();
    for (const cc of group) {
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (cp.setId) {
          slugs.add(cp.setId);
        }
      }
    }
    return [...slugs];
  }

  // Includes linked printings (printingId set) — they still need review.
  function uncheckedPrintingCountForGroup(
    group: typeof candidateCards,
    onlyFavorites?: boolean,
  ): number {
    let count = 0;
    for (const cc of group) {
      if (onlyFavorites && !favoriteProviders.has(cc.provider)) {
        continue;
      }
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (!cp.checkedAt) {
          count++;
        }
      }
    }
    return count;
  }

  // No provider or checkedAt narrowing: these are the rows the detail page
  // renders as "New:" groups, and it groups every unlinked candidate printing
  // the same way.
  function unlinkedPrintingCountForGroup(group: typeof candidateCards): number {
    let count = 0;
    for (const cc of group) {
      for (const cp of cpByCandidateCardId.get(cc.id) ?? []) {
        if (!cp.printingId) {
          count++;
        }
      }
    }
    return count;
  }

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
      setSlugs: [
        ...new Set([
          ...(setSlugsByCardId.get(card.id) ?? []),
          ...(group ? candidateSetSlugsForGroup(group) : []),
        ]),
      ].toSorted(),
      candidateCount: group?.length ?? 0,
      uncheckedCardCount:
        group?.filter((cc) => !cc.checkedAt && favoriteProviders.has(cc.provider)).length ?? 0,
      uncheckedPrintingCount: group ? uncheckedPrintingCountForGroup(group, true) : 0,
      unlinkedPrintingCount: group ? unlinkedPrintingCountForGroup(group) : 0,
      hasFavorite: group?.some((cc) => favoriteProviders.has(cc.provider)) ?? false,
      favoriteStagingShortCodes: group ? stagingIdsForGroup(group, true) : [],
      suggestedCardSlug: null,
      hasUserSubmission: group?.some((cc) => cc.provider === USER_SUBMISSION_PROVIDER) ?? false,
    };
  });

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

  for (const group of ccGroupsByNormName.values()) {
    // Not the map key — punctuation-only names are keyed by raw name so they
    // stay separate rows, but the response still carries their real (empty)
    // normalizedName, which the client uses to suppress the accept/link
    // affordances that need a lookup key.
    const normName = group[0].normName;
    results.push({
      cardSlug: null,
      name: group[0].name,
      normalizedName: normName,
      shortCodes: [],
      stagingShortCodes: stagingIdsForGroup(group),
      setSlugs: candidateSetSlugsForGroup(group).toSorted(),
      candidateCount: group.length,
      uncheckedCardCount: group.filter((cc) => !cc.checkedAt && favoriteProviders.has(cc.provider))
        .length,
      uncheckedPrintingCount: uncheckedPrintingCountForGroup(group, true),
      unlinkedPrintingCount: unlinkedPrintingCountForGroup(group),
      hasFavorite: group.some((cc) => favoriteProviders.has(cc.provider)),
      favoriteStagingShortCodes: stagingIdsForGroup(group, true),
      suggestedCardSlug: findSuggestedCard(normName),
      hasUserSubmission: group.some((cc) => cc.provider === USER_SUBMISSION_PROVIDER),
    });
  }

  // When provider-scoped, a matched card with no visible candidates is noise
  // for the reviewer — drop it so the list only shows reviewable groups.
  // (Unmatched rows derive from the filtered candidates, so they always keep
  // at least one.)
  return allowedProviders === null ? results : results.filter((row) => row.candidateCount > 0);
}

export async function buildExport(repo: Repo) {
  const [cards, printings, errataRows] = await Promise.all([
    repo.exportCards(),
    repo.exportPrintings(),
    repo.exportCardErrata(),
  ]);

  const printingsByCardId = new Map<string, typeof printings>();
  for (const p of printings) {
    const list = printingsByCardId.get(p.cardId) ?? [];
    list.push(p);
    printingsByCardId.set(p.cardId, list);
  }

  const errataByCardId = new Map(errataRows.map((e) => [e.cardId, e]));

  return cards.map((card) => {
    const errata = errataByCardId.get(card.id);
    return {
      card: {
        name: card.name,
        types: card.types,
        super_types: card.superTypes,
        domains: card.domains,
        might: card.might,
        energy: card.energy,
        power: card.power,
        might_bonus: card.mightBonus,
        rules_text: errata?.correctedRulesText ?? null,
        effect_text: errata?.correctedEffectText ?? null,
        tags: card.tags,
        short_code: card.slug,
        external_id: card.id,
        extra_data: null,
        // Curator note. Export-only — the upload side has no field for it.
        comment: card.comment,
      },
      printings: (printingsByCardId.get(card.id) ?? []).map((p) => ({
        short_code: p.shortCode,
        set_id: p.setSlug,
        set_name: p.setName,
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
        extra_data: p.imageId ? { image_id: p.imageId } : null,
        // Round-trip fidelity: these are candidate data (not admin-curated), so
        // they must survive an export → re-import cycle.
        language: p.language,
        printed_name: p.printedName,
        printed_year: p.printedYear,
        // Exported so the private candidate generators can use this document as
        // the canonical printing reference (finish enrichment keys on
        // short_code + language + markers).
        marker_slugs: p.markerSlugs,
        size: p.size,
        // Curator note. Export-only — the upload side has no field for it.
        comment: p.comment,
      })),
    };
  });
}

type CardForDetail = Awaited<ReturnType<Repo["cardForDetailBySlug"]>>;

async function buildDetailResponse(
  repo: Repo,
  marketplaceRepo: MarketplaceMappingRepo | null,
  card: NonNullable<CardForDetail> | null,
  errata: Awaited<ReturnType<Repo["cardErrataForDetail"]>>,
  normNames: string[],
  fallbackDisplayName: string,
  allowedProviders: Set<string> | null = null,
) {
  const allCandidates = normNames.length > 0 ? await repo.candidateCardsForDetail(normNames) : [];
  // card-review grant holders only see candidates from allowed providers
  // (null = full admin, unscoped). Candidate printings, groups, and source
  // images all derive from the filtered ids. Accepted printings/images stay
  // unfiltered — that's live catalog data, not candidate data.
  const candidates =
    allowedProviders === null
      ? allCandidates
      : allCandidates.filter((s) => allowedProviders.has(s.provider));
  const candidateIds = candidates.map((s) => s.id);
  const candidatePrintings =
    candidateIds.length > 0 ? await repo.candidatePrintingsForDetail(candidateIds) : [];

  const printings = card ? await repo.printingsForDetail(card.id) : [];

  const setIds = [...new Set(printings.map((p) => p.setId))];
  const setRows = setIds.length > 0 ? await repo.setInfoByIds(setIds) : [];
  const setSlugMap = new Map(setRows.map((s) => [s.id, s.slug]));
  const setNameMap = new Map(setRows.map((s) => [s.id, s.name]));

  const setTotals: Record<string, number> = {};
  for (const row of setRows) {
    if (row.printedTotal) {
      setTotals[row.slug] = row.printedTotal;
    }
  }
  const candidateSetSlugs = [
    ...new Set(
      candidatePrintings.filter((cp) => !cp.printingId && cp.setId).map((cp) => cp.setId as string),
    ),
  ].filter((slug) => !(slug in setTotals));
  if (candidateSetSlugs.length > 0) {
    const candidateSetRows = await repo.setPrintedTotalBySlugs(candidateSetSlugs);
    for (const row of candidateSetRows) {
      if (row.printedTotal) {
        setTotals[row.slug] = row.printedTotal;
      }
    }
  }

  const channelLinks = await repo.distributionChannelSlugsForPrintings(printings.map((p) => p.id));
  const channelSlugsByPrinting = new Map<string, string[]>();
  for (const link of channelLinks) {
    const list = channelSlugsByPrinting.get(link.printingId);
    if (list) {
      list.push(link.channelSlug);
    } else {
      channelSlugsByPrinting.set(link.printingId, [link.channelSlug]);
    }
  }

  const formattedPrintings = printings.map(({ setId, ...p }) => ({
    ...p,
    setId: setSlugMap.get(setId) ?? setId,
    setName: setNameMap.get(setId) ?? null,
    setSlug: setSlugMap.get(setId) ?? setId,
    distributionChannelSlugs: channelSlugsByPrinting.get(p.id) ?? [],
    expectedPrintingId: formatPrintingLabel(
      p.shortCode,
      p.markerSlugs,
      p.finish,
      p.language,
      p.size,
    ),
  }));

  const printingIds = printings.map((p) => p.id);
  const printingImages =
    printingIds.length > 0 ? await repo.printingImagesForDetail(printingIds) : [];

  // Marketplace data is admin-only, so provider-scoped callers (card-review
  // grant holders) get an empty list.
  const marketplaceMappings: AdminPrintingMarketplaceMappingResponse[] = [];
  if (card && marketplaceRepo && allowedProviders === null) {
    const variantRows = await marketplaceRepo.variantsForCard(card.id);
    for (const row of variantRows) {
      const marketplace = toMarketplaceName(row.marketplace);
      if (!marketplace) {
        continue;
      }
      marketplaceMappings.push({
        targetPrintingId: row.targetPrintingId,
        marketplace,
        externalId: row.externalId,
        productName: row.productName,
        finish: row.finish,
        variantLanguage: row.variantLanguage,
        ownerPrintingId: row.ownerPrintingId,
        ownerLanguage: row.ownerLanguage,
      });
    }
  }

  // Linked candidate printings are already shown under their accepted printing.
  const unlinkedCP = candidatePrintings.filter((cp) => !cp.printingId);
  const cpGroupMap = new Map<string, typeof unlinkedCP>();
  for (const cp of unlinkedCP) {
    const slugKey = [...(cp.markerSlugs ?? [])].sort().join(",");
    const key = `${cp.shortCode}|${cp.finish ?? ""}|${slugKey}|${cp.language ?? ""}`;
    let arr = cpGroupMap.get(key);
    if (!arr) {
      arr = [];
      cpGroupMap.set(key, arr);
    }
    arr.push(cp);
  }

  // Closest accepted printing for a candidate group whose exact expected id
  // has no counterpart: same short code (case-insensitive) and language, then
  // ranked by finish match, marker-set distance, and canonical order. Lets the
  // UI offer a one-click link for near-misses (marker or finish drift, e.g. a
  // source reporting `promo` where the catalogue says `launch-exclusive`).
  function findSuggestedPrinting(
    mcShortCode: string,
    finish: string,
    markerSlugs: string[],
    language: string | null,
  ): string | null {
    const wantedCode = mcShortCode.toUpperCase();
    const wantedLanguage = language ?? WellKnown.language.EN;
    const wantedMarkers = new Set(markerSlugs);
    let best: { id: string; score: number; rank: number } | null = null;
    for (const p of formattedPrintings) {
      if (p.shortCode.toUpperCase() !== wantedCode || p.language !== wantedLanguage) {
        continue;
      }
      // Marker distance is asymmetric on purpose. A printing carrying markers
      // the source didn't mention is the common case — sources under-report
      // ("promo" where the catalogue says "prerelease+promo") — while a
      // printing lacking a marker the source did state is a different variant.
      // A symmetric distance ties those two cases, and the canonical-rank
      // tiebreak then hands the suggestion to the unmarked printing.
      // A missing marker also beats a finish mismatch: several sources list
      // VEN-118's foil-only `{promo}` printing as normal, and matching the
      // unmarked normal printing on finish alone is the wrong variant.
      const missing = markerSlugs.filter((s) => !p.markerSlugs.includes(s)).length;
      const extra = p.markerSlugs.filter((s) => !wantedMarkers.has(s)).length;
      const score =
        (p.finish === finish ? 0 : FINISH_MISMATCH_COST) +
        missing * MISSING_MARKER_COST +
        extra * EXTRA_MARKER_COST;
      if (!best || score < best.score || (score === best.score && p.canonicalRank < best.rank)) {
        best = { id: p.id, score, rank: p.canonicalRank };
      }
    }
    return best?.id ?? null;
  }

  const filteredGroups: CandidatePrintingGroupResponse[] = [];
  for (const [, groupCandidates] of cpGroupMap) {
    const first = groupCandidates[0];
    const mcShortCode = mostCommonValue(groupCandidates.map((s) => s.shortCode));
    const finish = resolveFinish(first.finish, first.rarity);
    const language = mostCommonValue(groupCandidates.map((s) => s.language ?? "")) || null;

    filteredGroups.push({
      mostCommonShortCode: mcShortCode,
      shortCodes: groupCandidates.map((s) => s.id),
      expectedPrintingId: formatPrintingLabel(
        mcShortCode,
        first.markerSlugs ?? [],
        finish,
        language,
      ),
      language,
      suggestedPrintingId: findSuggestedPrinting(
        mcShortCode,
        finish,
        first.markerSlugs ?? [],
        language,
      ),
    });
  }

  const displayName = card
    ? card.name
    : candidates.length > 0
      ? candidates.reduce(
          (best, s) => (s.name.length < best.length ? s.name : best),
          candidates[0].name,
        )
      : fallbackDisplayName;

  return {
    card: card
      ? {
          id: card.id,
          slug: card.slug,
          name: card.name,
          types: card.types,
          superTypes: card.superTypes,
          domains: card.domains,
          might: card.might,
          energy: card.energy,
          power: card.power,
          mightBonus: card.mightBonus,
          keywords: card.keywords,
          errata: errata
            ? {
                correctedRulesText: errata.correctedRulesText,
                correctedEffectText: errata.correctedEffectText,
                source: errata.source,
                sourceUrl: errata.sourceUrl,
                effectiveDate: errata.effectiveDate,
              }
            : null,
          tags: card.tags,
          maxCopiesOverride: card.maxCopiesOverride,
          comment: card.comment,
        }
      : null,
    displayName,
    sources: candidates.map((s) => formatCandidateCard(s)),
    // `printingsForDetail` already orders by canonicalRank. Kept explicit
    // here as a safety net against upstream reordering (the spread in
    // `formattedPrintings` preserves order, but a future refactor might not).
    printings: formattedPrintings.sort((a, b) => a.canonicalRank - b.canonicalRank),
    candidatePrintings: candidatePrintings.map((cp) => formatCandidatePrinting(cp)),
    candidatePrintingGroups: filteredGroups,
    expectedCardId: deriveExpectedCardId(displayName, card?.slug),
    // `rotation` is a smallint the repo reads as `number`, but the domain is
    // fixed (enforced on write by `setRotation`). Narrow it here to satisfy the
    // response schema; the schema also runtime-validates, so a stray value 500s
    // rather than silently escaping.
    printingImages: printingImages.map((image) => ({
      ...image,
      rotation: image.rotation as 0 | 90 | 180 | 270,
    })),
    setTotals,
    marketplaceMappings,
  };
}

export async function buildCardDetail(
  repo: Repo,
  marketplaceRepo: MarketplaceMappingRepo,
  cardSlug: string,
  allowedProviders: Set<string> | null = null,
) {
  const card = await repo.cardForDetailBySlug(cardSlug);
  if (!card) {
    return buildDetailResponse(repo, marketplaceRepo, null, null, [], cardSlug, allowedProviders);
  }

  const aliases = await repo.cardNameAliases(card.id);
  if (aliases.length === 0) {
    throw new AppError(
      500,
      ERROR_CODES.MISSING_ALIAS,
      `Card "${card.slug}" has no name aliases — this should never happen. Re-create the alias to fix.`,
    );
  }

  const errata = await repo.cardErrataForDetail(card.id);
  // Always match candidates by the card's own normalized name too, not just its
  // stored aliases. The list view (buildCandidateCardList) matches by
  // card.normName directly plus aliases; mirroring that here keeps the two views
  // consistent even when the self-alias row is missing (e.g. a rename left the
  // old-name alias behind — the norm_name trigger updates cards.norm_name but
  // nothing guarantees a matching alias row exists).
  const normNames = [...new Set([card.normName, ...aliases.map((a) => a.normName)])];
  return buildDetailResponse(
    repo,
    marketplaceRepo,
    card,
    errata,
    normNames,
    card.name,
    allowedProviders,
  );
}

export async function buildUnmatchedDetail(
  repo: Repo,
  normName: string,
  allowedProviders: Set<string> | null = null,
) {
  const result = await buildDetailResponse(
    repo,
    null,
    null,
    null,
    [normName],
    normName,
    allowedProviders,
  );
  return {
    displayName: result.displayName,
    sources: result.sources,
    candidatePrintings: result.candidatePrintings,
    candidatePrintingGroups: result.candidatePrintingGroups,
    defaultCardId: result.expectedCardId,
    setTotals: result.setTotals,
  };
}
