import type { MappingPrintingResponse, StagedProductResponse } from "@openrift/shared";

export type {
  AssignableCardResponse as AssignableCard,
  MappingPrintingResponse as MappingPrinting,
  MarketplaceAssignmentResponse as MarketplaceAssignment,
  StagedProductResponse as StagedProduct,
  UnifiedMappingGroupResponse as UnifiedMappingGroup,
  UnifiedMappingPrintingResponse as UnifiedMappingPrinting,
} from "@openrift/shared";

export interface SourceMappingConfig {
  source: string;
  displayName: string;
  shortName: string;
  /**
   * Build a deep link to the marketplace's product page. Pass the printing's
   * language (e.g. "EN", "ZH") to land on listings filtered by that language.
   * Omit the language for a language-agnostic link.
   */
  productUrl: (id: number, language?: string | null) => string;
}

export interface MappingGroup {
  cardId: string;
  cardSlug: string;
  cardName: string;
  cardType: string;
  superTypes: string[];
  domains: string[];
  energy: number | null;
  might: number | null;
  setId: string;
  setName: string;
  printings: MappingPrintingResponse[];
  stagedProducts: StagedProductResponse[];
  assignedProducts: StagedProductResponse[];
  /**
   * Optional per-product evidence from sibling assignments in other languages
   * on this marketplace. Keyed by `${externalId}|${finish}` → set of
   * short_codes already bound to that (externalId, finish) pair. Only
   * meaningful for CardTrader (the sole per-language marketplace); TCG/CM
   * leave this undefined.
   */
  crossLanguageEvidence?: ReadonlyMap<string, ReadonlySet<string>>;
}
