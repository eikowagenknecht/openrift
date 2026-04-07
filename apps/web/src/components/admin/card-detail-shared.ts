import type {
  CandidateCardResponse,
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";

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
import { useEnumOrders } from "@/hooks/use-enums";
import { useIgnoreCandidateCard, useIgnoreCandidatePrinting } from "@/hooks/use-ignored-candidates";
import { useLanguages } from "@/hooks/use-languages";
import { usePromoTypes } from "@/hooks/use-promo-types";
import { useProviderSettings } from "@/hooks/use-provider-settings";

// ---------------------------------------------------------------------------
// Shared hook: data + mutations used by both existing and new detail pages
// ---------------------------------------------------------------------------

export function useCardDetailData() {
  const { orders } = useEnumOrders();

  const { data: providerSettingsData } = useProviderSettings();
  const providerSettings = providerSettingsData?.providerSettings ?? [];

  const { data: promoTypesData } = usePromoTypes();
  const promoTypes = promoTypesData?.promoTypes ?? [];

  const { data: languagesData } = useLanguages();
  const languagesList = languagesData?.languages ?? [];

  const { data: artistSuggestions } = useDistinctArtists();

  const printingSourceFields: FieldDef[] = buildCandidatePrintingFields(
    orders,
    promoTypes
      .map((pt: { id: string; label: string }) => ({
        value: pt.id,
        label: pt.label,
      }))
      .toSorted((a, b) => a.label.localeCompare(b.label)),
    artistSuggestions,
    languagesList.map((lang: { code: string; name: string }) => ({
      value: lang.code,
      label: lang.name,
    })),
  );

  const candidateCardFields: FieldDef[] = buildCandidateCardFields(orders);

  const checkCandidateCard = useCheckCandidateCard();
  const uncheckCandidateCard = useUncheckCandidateCard();
  const checkPrintingSource = useCheckCandidatePrinting();
  const uncheckPrintingSource = useUncheckCandidatePrinting();
  const checkAllCandidatePrintings = useCheckAllCandidatePrintings();
  const ignoreCardSource = useIgnoreCandidateCard();
  const ignorePrintingSource = useIgnoreCandidatePrinting();

  return {
    providerSettings,
    promoTypes,
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
          label = label.replaceAll(/^[\s\-–—(]+|[)\s]+$/g, "");
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
