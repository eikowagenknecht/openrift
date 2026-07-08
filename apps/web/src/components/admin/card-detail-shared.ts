import type {
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";
import { appendSetTotal, fixTypography } from "@openrift/shared";
import { cardFieldsSchema } from "@openrift/shared/contracts";

import type { FieldDef, PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import {
  buildCandidateCardFields,
  buildCandidatePrintingFields,
} from "@/components/admin/candidate-spreadsheet";
import {
  useCheckAllCandidatePrintings,
  useCheckCandidateCard,
  useCheckCandidatePrinting,
  useUncheckCandidateCard,
  useUncheckCandidatePrinting,
} from "@/hooks/use-admin-card-mutations";
import { useDistinctArtists } from "@/hooks/use-distinct-artists";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useIgnoreCandidateCard, useIgnoreCandidatePrinting } from "@/hooks/use-ignored-candidates";
import { useLanguages } from "@/hooks/use-languages";
import { useMarkers } from "@/hooks/use-markers";
import { useProviderSettings } from "@/hooks/use-provider-settings";
import { buildChannelTree, leafChannels } from "@/lib/distribution-channel-tree";

// ---------------------------------------------------------------------------
// Shared hook: data + mutations used by both existing and new detail pages
// ---------------------------------------------------------------------------

export function useCardDetailData(invalidates: readonly (readonly unknown[])[]) {
  const { orders, labels } = useEnumOrders();

  const { data: providerSettingsData } = useProviderSettings();
  const providerSettings = providerSettingsData?.providerSettings ?? [];

  const { data: markersData } = useMarkers();
  const markers = markersData?.markers ?? [];

  const { data: channelsData } = useDistributionChannels();
  const distributionChannels = channelsData?.distributionChannels ?? [];
  // Card-detail can only attach printings to leaf channels. Show the full
  // breadcrumb (e.g. "Regional Event › Houston › Top 1") so the picker stays
  // unambiguous when the same leaf label repeats under different parents.
  const channelTree = buildChannelTree(distributionChannels);
  const channelPickerOptions = leafChannels(channelTree).map((node) => ({
    value: node.channel.slug,
    label: node.breadcrumb,
  }));

  const { data: languagesData } = useLanguages();
  const languagesList = languagesData?.languages ?? [];

  const { data: artistSuggestions } = useDistinctArtists();

  const printingSourceFields: FieldDef[] = buildCandidatePrintingFields(
    orders,
    labels,
    markers.map((m) => ({ value: m.slug, label: m.label })),
    channelPickerOptions,
    artistSuggestions,
    languagesList.map((lang: { code: string; name: string }) => ({
      value: lang.code,
      label: lang.name,
    })),
  );

  const candidateCardFields: FieldDef[] = buildCandidateCardFields(orders, labels);

  const checkCandidateCard = useCheckCandidateCard(invalidates);
  const uncheckCandidateCard = useUncheckCandidateCard(invalidates);
  const checkPrintingSource = useCheckCandidatePrinting(invalidates);
  const uncheckPrintingSource = useUncheckCandidatePrinting(invalidates);
  const checkAllCandidatePrintings = useCheckAllCandidatePrintings(invalidates);
  const ignoreCardSource = useIgnoreCandidateCard();
  const ignorePrintingSource = useIgnoreCandidatePrinting();

  return {
    providerSettings,
    markers,
    candidateCardFields,
    printingSourceFields,
    checkCandidateCard,
    uncheckCandidateCard,
    checkPrintingSource,
    uncheckPrintingSource,
    checkAllCandidatePrintings,
    ignoreCardSource,
    ignorePrintingSource,
  };
}

// ---------------------------------------------------------------------------
// Utility: build provider label maps from candidate card sources
// ---------------------------------------------------------------------------

export function buildSourceLabels(
  sources: CandidateCardResponse[],
  canonicalName?: string | null,
): { labels: Record<string, string>; names: Record<string, string> } {
  const labels = Object.fromEntries(sources.map((s) => [s.id, s.provider]));

  const names = Object.fromEntries(
    sources
      .filter((s) => s.name !== canonicalName)
      .map((s) => {
        let label = s.name;
        if (canonicalName) {
          label = label.startsWith(canonicalName) ? label.slice(canonicalName.length) : label;
          label = label.replaceAll(/^[\s\-–—(]+|[)\s]+$/gu, "");
        }
        return [s.id, label];
      }),
  );

  return { labels, names };
}

// ---------------------------------------------------------------------------
// Utility: map API printing groups to local PrintingGroup shape
// ---------------------------------------------------------------------------

export function buildPrintingGroups(
  apiGroups: CandidatePrintingGroupResponse[],
  candidatePrintings: CandidatePrintingResponse[],
): (PrintingGroup & { groupKey: string })[] {
  const byId = new Map(candidatePrintings.map((ps) => [ps.id, ps]));
  return apiGroups.map((g, index) => {
    const candidates = g.shortCodes
      .map((id: string) => byId.get(id))
      .filter(Boolean) as CandidatePrintingResponse[];
    return {
      candidates,
      expectedPrintingId: g.expectedPrintingId,
      groupKey: candidates[0]?.id ?? `${g.expectedPrintingId}-${index}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Utility: deduplicate source images by URL, collecting provider labels
// ---------------------------------------------------------------------------

export interface DeduplicatedSourceImage {
  candidatePrintingId: string;
  url: string;
  source: string;
}

export function deduplicateSourceImages(
  sources: CandidatePrintingResponse[],
  providerLabels: Record<string, string>,
): DeduplicatedSourceImage[] {
  return [
    ...sources
      .filter((ps) => ps.imageUrl)
      .reduce((acc, ps) => {
        const url = ps.imageUrl as string;
        const src = providerLabels[ps.candidateCardId] ?? "unknown";
        const existing = acc.get(url);
        if (existing) {
          if (!existing.source.split(", ").includes(src)) {
            existing.source += `, ${src}`;
          }
        } else {
          acc.set(url, { candidatePrintingId: ps.id, url, source: src });
        }
        return acc;
      }, new Map<string, DeduplicatedSourceImage>())
      .values(),
  ];
}

// ---------------------------------------------------------------------------
// Utility: sort comparator by provider sort order
// ---------------------------------------------------------------------------

export function sortByProviderOrder(providerSettings: ProviderSettingResponse[]) {
  const settingsMap = new Map(providerSettings.map((s) => [s.provider, s]));
  return (aLabel: string, bLabel: string) => {
    const aOrder = settingsMap.get(aLabel)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(bLabel)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return aLabel.localeCompare(bLabel);
  };
}

// ---------------------------------------------------------------------------
// Utility: normalize candidate printing values for comparison
// ---------------------------------------------------------------------------

function candidateHasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function isValidFieldOption(field: FieldDef, value: unknown): boolean {
  if (field.labeledOptions) {
    return Array.isArray(value)
      ? value.every((v) => field.labeledOptions?.some((o) => o.value === String(v)))
      : field.labeledOptions.some((o) => o.value === String(value));
  }
  if (field.options) {
    return Array.isArray(value)
      ? value.every((v) => field.options?.includes(String(v)))
      : field.options.includes(String(value));
  }
  return true;
}

/** Card-field keys the accept-new-card schema actually persists (everything in
 * `cardFieldsSchema` except `id`, which the page collects via its own Card ID
 * input). Pre-seeding is limited to these so the Active column never fills with
 * fields the accept endpoint would silently strip (e.g. rules/effect text). */
const ACCEPT_CARD_FIELD_KEYS = new Set(
  Object.keys(cardFieldsSchema.shape).filter((key) => key !== "id"),
);

// Whether a field carries a dropdown with at least one loaded option. Used to
// decide when option validation is meaningful: before the enum lists load,
// `labeledOptions` is an empty (but truthy) array, so validating would wrongly
// reject every value.
function hasDropdownOptions(field: FieldDef): boolean {
  return (field.options?.length ?? 0) > 0 || (field.labeledOptions?.length ?? 0) > 0;
}

/**
 * Build the initial Active-column selection for the new-card page: for each
 * accept-persisted card field, take the value from the highest-priority source
 * (provider sort order, then name) that has a usable value. Dropdown values are
 * skipped when they aren't a valid option so an unknown slug never pre-fills.
 *
 * The result is a suggestion the admin reviews before accepting, not a commit.
 * Nothing is saved until they click "Accept as new card".
 *
 * @returns A partial card-fields record; empty when no source has usable values.
 */
export function buildPreseededActiveCard(
  sources: readonly CandidateCardResponse[],
  fields: readonly FieldDef[],
  providerSettings: readonly ProviderSettingResponse[],
): Record<string, unknown> {
  const settingsMap = new Map(providerSettings.map((s) => [s.provider, s]));
  const sorted = sources.toSorted((a, b) => {
    const aOrder = settingsMap.get(a.provider)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(b.provider)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.provider.localeCompare(b.provider);
  });

  const seed: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.readOnly || !ACCEPT_CARD_FIELD_KEYS.has(field.key)) {
      continue;
    }
    for (const source of sorted) {
      const value = (source as unknown as Record<string, unknown>)[field.key];
      if (!candidateHasValue(value)) {
        continue;
      }
      if (hasDropdownOptions(field) && !isValidFieldOption(field, value)) {
        continue;
      }
      seed[field.key] = value;
      break;
    }
  }
  return seed;
}

/**
 * Determine if a printing's accepted values match its favorited candidate sources.
 * Mirrors the "yellow cell" logic in CandidateSpreadsheet: a mismatch exists when a
 * favorited-provider candidate has a valid value for a writable field that differs
 * from the accepted printing value (after normalization).
 *
 * @returns `"match"` when no favorited source mismatches, `"mismatch"` otherwise.
 */
export function computePrintingMatchStatus(
  printing: AdminPrintingResponse,
  candidatePrintings: readonly CandidatePrintingResponse[],
  providerLabels: Record<string, string>,
  providerSettings: readonly ProviderSettingResponse[],
  printingFields: readonly FieldDef[],
  setTotals: Record<string, number>,
  costKeywords: readonly string[] = [],
): "match" | "mismatch" {
  const favoriteProviders = new Set(
    providerSettings.filter((s) => s.isFavorite).map((s) => s.provider),
  );
  const favoritedSources = candidatePrintings.filter((ps) =>
    favoriteProviders.has(providerLabels[ps.candidateCardId] ?? ""),
  );
  if (favoritedSources.length === 0) {
    return "match";
  }
  const normalize = buildPrintingNormalizer(setTotals, printing.setSlug, costKeywords);
  const printingRecord = printing as unknown as Record<string, unknown>;
  for (const field of printingFields) {
    if (field.readOnly) {
      continue;
    }
    const activeValue = printingRecord[field.key];
    const activeJson = JSON.stringify(activeValue);
    for (const source of favoritedSources) {
      const candidateValue = (source as unknown as Record<string, unknown>)[field.key];
      if (!candidateHasValue(candidateValue)) {
        continue;
      }
      const hasDropdown =
        (field.options !== undefined && field.options.length > 0) ||
        (field.labeledOptions !== undefined && field.labeledOptions.length > 0);
      if (hasDropdown && !isValidFieldOption(field, candidateValue)) {
        continue;
      }
      const normalized = normalize(field.key, candidateValue);
      if (JSON.stringify(normalized) !== activeJson) {
        return "mismatch";
      }
    }
  }
  return "match";
}

/** Fields where `fixTypography()` is applied with default options on accept. */
const TYPOGRAPHY_FIELDS = new Set(["printedRulesText", "printedEffectText"]);

/**
 * Build a normalizer that mirrors the server-side transformations applied when
 * accepting a printing field from a provider. This lets the comparison in
 * CandidateSpreadsheet treat formatting-only differences as equal.
 *
 * @returns A normalizeCandidate callback suitable for the CandidateSpreadsheet prop.
 */
export function buildPrintingNormalizer(
  setTotals: Record<string, number>,
  candidateSetSlug?: string | null,
  costKeywords: readonly string[] = [],
): (fieldKey: string, value: unknown) => unknown {
  const printedTotal = candidateSetSlug ? (setTotals[candidateSetSlug] ?? null) : null;
  return (fieldKey: string, value: unknown): unknown => {
    if (typeof value !== "string") {
      return value;
    }
    if (TYPOGRAPHY_FIELDS.has(fieldKey)) {
      return fixTypography(value, { costKeywords });
    }
    if (fieldKey === "flavorText") {
      return fixTypography(value, { italicParens: false, keywordGlyphs: false });
    }
    if (fieldKey === "publicCode") {
      return appendSetTotal(value, printedTotal);
    }
    return value;
  };
}
