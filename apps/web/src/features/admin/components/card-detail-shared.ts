import { cardFieldsSchema } from "@openrift/shared/contracts/admin/card-mutations";
import { appendSetTotal, fixTypography } from "@openrift/shared/fix-typography";
import { findStandardArtFallback } from "@openrift/shared/standard";
import type {
  AdminPrintingImageResponse,
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared/types/api/admin";

import type {
  CandidateCardFieldKey,
  CandidatePrintingFieldKey,
  FieldDef,
  NewCardFieldKey,
} from "@/features/admin/components/candidate-field-defs";
import {
  buildCandidateCardFields,
  buildCandidatePrintingFields,
  buildNewCardFields,
} from "@/features/admin/components/candidate-field-defs";
import {
  useCheckAllCandidatePrintings,
  useCheckCandidateCard,
  useCheckCandidatePrinting,
  useUncheckCandidateCard,
  useUncheckCandidatePrinting,
} from "@/features/admin/hooks/use-admin-card-mutations";
import {
  useIgnoreCandidateCard,
  useIgnoreCandidatePrinting,
} from "@/features/admin/hooks/use-ignored-candidates";
import { useProviderSettings } from "@/features/admin/hooks/use-provider-settings";
import type { SourceSubmitter } from "@/features/admin/lib/candidate-submitter";
import { buildSourceSubmitters } from "@/features/admin/lib/candidate-submitter";
import { useDistinctArtists } from "@/features/cards/hooks/use-distinct-artists";
import { buildChannelTree, leafChannels } from "@/features/cards/lib/distribution-channel-tree";
import { useDistributionChannels } from "@/hooks/use-distribution-channels";
import { useEnumOrders } from "@/hooks/use-enums";
import { useLanguages } from "@/hooks/use-languages";
import { useMarkers } from "@/hooks/use-markers";

export function useCardDetailData(invalidates: readonly (readonly unknown[])[]) {
  const { orders, labels } = useEnumOrders();

  const { data: providerSettingsData } = useProviderSettings();
  const providerSettings = providerSettingsData?.providerSettings ?? [];

  const { data: markersData } = useMarkers();
  const markers = markersData?.markers ?? [];

  const { data: channelsData } = useDistributionChannels();
  const distributionChannels = channelsData?.distributionChannels ?? [];
  // Show the full breadcrumb so the picker stays unambiguous when the same
  // leaf label repeats under different parents.
  const channelTree = buildChannelTree(distributionChannels);
  const channelPickerOptions = leafChannels(channelTree).map((node) => ({
    value: node.channel.slug,
    label: node.breadcrumb,
  }));

  const { data: languagesData } = useLanguages();
  const languagesList = languagesData?.languages ?? [];

  const { data: artistSuggestions } = useDistinctArtists();

  const printingSourceFields: FieldDef<CandidatePrintingFieldKey>[] = buildCandidatePrintingFields(
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

  const candidateCardFields: FieldDef<CandidateCardFieldKey>[] = buildCandidateCardFields(
    orders,
    labels,
  );
  // The new-card page also shows the provider's rules/effect text; neither is a
  // `cards` column, so they stay off `candidateCardFields`.
  const newCardFields: FieldDef<NewCardFieldKey>[] = buildNewCardFields(orders, labels);

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
    newCardFields,
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

export function buildSourceLabels(
  sources: CandidateCardResponse[],
  canonicalName?: string | null,
): {
  labels: Record<string, string>;
  names: Record<string, string>;
  submitters: Record<string, SourceSubmitter>;
} {
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

  return { labels, names, submitters: buildSourceSubmitters(sources) };
}

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

// Mirrors findStandardArtFallback's catalog rule; only active, rehosted images
// count, since an external-only image is not servable on the site.
export function findDerivedArtPrinting(
  printing: AdminPrintingResponse,
  printings: readonly AdminPrintingResponse[],
  printingImages: readonly AdminPrintingImageResponse[],
): AdminPrintingResponse | null {
  const candidates = printings.map((p) => ({
    id: p.id,
    cardId: p.cardId,
    language: p.language,
    canonicalRank: p.canonicalRank,
    rarity: p.rarity,
    artVariant: p.artVariant,
    isSigned: p.isSigned,
    isOvernumbered: p.isOvernumbered,
    finish: p.finish,
    size: p.size,
    markers: p.markerSlugs.map((slug) => ({ id: slug, slug, label: slug, description: null })),
    images: printingImages
      .filter((img) => img.printingId === p.id && img.isActive && img.rehostedUrl !== null)
      .map((img) => ({ face: img.face, imageId: img.imageFileId })),
  }));
  const subject = candidates.find((c) => c.id === printing.id);
  if (!subject) {
    return null;
  }
  const sourceId = findStandardArtFallback(subject, candidates)?.printing?.id;
  return printings.find((p) => p.id === sourceId) ?? null;
}

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

// cardFieldsSchema minus id (collected separately); pre-seeding stays limited to
// these so Active never fills with fields the accept endpoint would strip.
const ACCEPT_CARD_FIELD_KEYS = new Set(
  Object.keys(cardFieldsSchema.shape).filter((key) => key !== "id"),
);

// Before enum lists load, `labeledOptions` is an empty but truthy array, so
// validating against it would wrongly reject every value.
function hasDropdownOptions(field: FieldDef): boolean {
  return (field.options?.length ?? 0) > 0 || (field.labeledOptions?.length ?? 0) > 0;
}

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

export function buildPreseededActivePrinting(
  candidates: readonly CandidatePrintingResponse[],
  fields: readonly FieldDef[],
  providerSettings: readonly ProviderSettingResponse[],
  providerLabels: Record<string, string>,
  setReleaseYears: Record<string, number>,
): Record<string, unknown> {
  const settingsMap = new Map(providerSettings.map((s) => [s.provider, s]));
  const providerOf = (candidate: CandidatePrintingResponse): string =>
    providerLabels[candidate.candidateCardId] ?? "";
  const sorted = candidates.toSorted((a, b) => {
    const providerA = providerOf(a);
    const providerB = providerOf(b);
    const aOrder = settingsMap.get(providerA)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(providerB)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return providerA.localeCompare(providerB);
  });

  const seed: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.readOnly) {
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

  // Image: only from a favorited provider, so accepting sets a favorite image as
  // the main image (and never a non-favorite one).
  const favoriteProviders = new Set(
    providerSettings.filter((s) => s.isFavorite).map((s) => s.provider),
  );
  for (const source of sorted) {
    if (!favoriteProviders.has(providerOf(source))) {
      continue;
    }
    if (candidateHasValue(source.imageUrl)) {
      seed.imageUrl = source.imageUrl;
      break;
    }
  }

  // Printed year: fall back to the set's release year when no source supplied
  // one. Sets reach each language on their own date, so the printing's own
  // language wins; the set's earliest release is the fallback.
  if (!candidateHasValue(seed.printedYear) && typeof seed.setId === "string") {
    const languageKey =
      typeof seed.language === "string" ? `${seed.setId}|${seed.language}` : undefined;
    const year =
      (languageKey === undefined ? undefined : setReleaseYears[languageKey]) ??
      setReleaseYears[seed.setId];
    if (year !== undefined) {
      seed.printedYear = year;
    }
  }

  return seed;
}

const TYPOGRAPHY_FIELDS = new Set(["printedRulesText", "printedEffectText"]);

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
