import type { AdminMarketplaceName } from "@openrift/shared/types/api/admin";
import { formatPrintingLabel, normalizeNameForIdentity } from "@openrift/shared/utils";

import type {
  SourceMappingConfig,
  StagedProduct,
  UnifiedMappingGroup,
  UnifiedMappingPrinting,
} from "@/features/admin/lib/price-mappings-types";

import { CM_CONFIG, CT_CONFIG, TCG_CONFIG } from "./source-configs";
import type { ProductSuggestion } from "./suggest-mapping";
import { productSuggestionKey, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";

export interface PrintingAssignment {
  externalId: number;
  finish: string;
  language: string | null;
  printingId: string;
}

export const MARKETPLACE_CONFIGS: Record<AdminMarketplaceName, SourceMappingConfig> = {
  tcgplayer: TCG_CONFIG,
  cardmarket: CM_CONFIG,
  cardtrader: CT_CONFIG,
};

const STALE_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function isStaleRecord(recordedAt: Date): boolean {
  return Date.now() - recordedAt.getTime() > STALE_THRESHOLD_MS;
}

export interface MarketplaceHandlers {
  onIgnoreVariant: (externalId: number, finish: string, language: string | null) => void;
  onIgnoreProduct: (externalId: number) => void;
  onAssignToCard: (
    externalId: number,
    finish: string,
    language: string | null,
    cardId: string,
  ) => void;
  onAssignToPrinting: (
    externalId: number,
    finish: string,
    language: string | null,
    printingId: string,
  ) => void;
  onBatchAssignToPrintings: (mappings: PrintingAssignment[]) => void;
  onUnassign: (externalId: number, finish: string, language: string | null) => void;
  onUnmapPrinting: (
    printingId: string,
    externalId: number,
    finish: string,
    language: string | null,
  ) => void;
  isIgnoring: boolean;
  isAssigning: boolean;
  isAssigningToPrinting: boolean;
  isUnassigning: boolean;
  isUnmappingPrinting: boolean;
}

interface AssignedPrinting {
  printingId: string;
  shortCode: string;
  markerSlugs: string[];
  finish: string;
  size: string;
  language: string;
}

export interface TableEntry {
  marketplace: AdminMarketplaceName;
  product: StagedProduct;
  isAssigned: boolean;
  assignedPrintings: AssignedPrinting[];
  assignedPrintingIds: Set<string>;
  otherAssignedPrintingIds: Set<string>;
}

export function setPrefix(shortCode: string): string {
  const dash = shortCode.indexOf("-");
  return dash === -1 ? shortCode : shortCode.slice(0, dash);
}

export function isCardNameMismatch(productName: string, cardName: string): boolean {
  const normProduct = normalizeNameForIdentity(productName);
  const normCard = normalizeNameForIdentity(cardName);
  if (normCard.length === 0) {
    return false;
  }
  return normProduct !== normCard;
}

// Cardmarket's price guide is language-aggregate: every CM staging row carries a
// placeholder "EN" regardless of the card's real language, so it renders as a dash.
export function displayedProductLanguage(
  marketplace: AdminMarketplaceName,
  language: string | null,
): string | null {
  if (marketplace === "cardmarket") {
    return null;
  }
  return language || null;
}

export function collectEntries(group: UnifiedMappingGroup): TableEntry[] {
  const printingById = new Map(group.printings.map((p) => [p.printingId, p]));
  const entries: TableEntry[] = [];
  for (const marketplace of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
    const { stagedProducts, assignedProducts, assignments = [] } = group[marketplace];
    const seen = new Set<string>();
    for (const product of [...stagedProducts, ...assignedProducts]) {
      const dedupeKey = `${product.externalId}::${product.finish}::${product.language}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      const isAssigned = assignedProducts.some(
        (ap) =>
          ap.externalId === product.externalId &&
          ap.finish === product.finish &&
          ap.language === product.language,
      );
      // Cardmarket stores `null` for the assignment language, so a null
      // assignment matches every row's language.
      const matchingPrintings = assignments
        .filter(
          (a) =>
            a.externalId === product.externalId &&
            a.finish === product.finish &&
            (a.language === null || a.language === product.language),
        )
        .map((a) => printingById.get(a.printingId))
        .filter((p): p is UnifiedMappingPrinting => p !== undefined);
      const assignedPrintings: AssignedPrinting[] = matchingPrintings
        .map((p) => ({
          printingId: p.printingId,
          shortCode: p.shortCode,
          markerSlugs: p.markerSlugs,
          finish: p.finish,
          size: p.size,
          language: p.language,
        }))
        .toSorted((a, b) =>
          formatPrintingLabel(
            a.shortCode,
            a.markerSlugs,
            a.finish,
            a.language,
            a.size,
          ).localeCompare(
            formatPrintingLabel(b.shortCode, b.markerSlugs, b.finish, b.language, b.size),
          ),
        );
      const assignedPrintingIds = new Set(matchingPrintings.map((p) => p.printingId));
      const otherAssignedPrintingIds = new Set(
        assignments.filter((a) => a.externalId !== product.externalId).map((a) => a.printingId),
      );
      entries.push({
        marketplace,
        product,
        isAssigned,
        assignedPrintings,
        assignedPrintingIds,
        otherAssignedPrintingIds,
      });
    }
  }
  entries.sort((a, b) => {
    if (a.marketplace !== b.marketplace) {
      return a.marketplace.localeCompare(b.marketplace);
    }
    return (
      (a.product.language ?? "").localeCompare(b.product.language ?? "") ||
      (a.product.groupName ?? "").localeCompare(b.product.groupName ?? "") ||
      b.product.finish.localeCompare(a.product.finish) ||
      a.product.externalId - b.product.externalId
    );
  });
  return entries;
}

export function collectStrongMappings(
  group: UnifiedMappingGroup,
  suggestions: Map<string, ProductSuggestion[]> | undefined,
): Record<AdminMarketplaceName, PrintingAssignment[]> {
  const out: Record<AdminMarketplaceName, PrintingAssignment[]> = {
    tcgplayer: [],
    cardmarket: [],
    cardtrader: [],
  };
  for (const entry of collectEntries(group)) {
    if (entry.isAssigned) {
      continue;
    }
    const key = productSuggestionKey(
      entry.marketplace,
      entry.product.externalId,
      entry.product.finish,
      entry.product.language,
    );
    for (const s of suggestions?.get(key) ?? []) {
      if (s.score < STRONG_MATCH_THRESHOLD) {
        continue;
      }
      out[entry.marketplace].push({
        externalId: entry.product.externalId,
        finish: entry.product.finish,
        language: entry.product.language,
        printingId: s.printingId,
      });
    }
  }
  return out;
}

export function collectWeakMappings(
  group: UnifiedMappingGroup,
  suggestions: Map<string, ProductSuggestion[]> | undefined,
): Record<AdminMarketplaceName, PrintingAssignment[]> {
  const out: Record<AdminMarketplaceName, PrintingAssignment[]> = {
    tcgplayer: [],
    cardmarket: [],
    cardtrader: [],
  };
  for (const entry of collectEntries(group)) {
    if (entry.isAssigned) {
      continue;
    }
    const key = productSuggestionKey(
      entry.marketplace,
      entry.product.externalId,
      entry.product.finish,
      entry.product.language,
    );
    for (const s of suggestions?.get(key) ?? []) {
      if (s.isWeak !== true) {
        continue;
      }
      out[entry.marketplace].push({
        externalId: entry.product.externalId,
        finish: entry.product.finish,
        language: entry.product.language,
        printingId: s.printingId,
      });
    }
  }
  return out;
}
