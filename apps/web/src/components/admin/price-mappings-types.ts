import type { MappingPrintingResponse, StagedProductResponse } from "@openrift/shared";

export type {
  AssignableCardResponse as AssignableCard,
  MappingPrintingResponse as MappingPrinting,
  StagedProductResponse as StagedProduct,
  UnifiedMappingGroupResponse as UnifiedMappingGroup,
  UnifiedMappingPrintingResponse as UnifiedMappingPrinting,
} from "@openrift/shared";

export interface SourceMappingConfig {
  source: string;
  displayName: string;
  shortName: string;
  productUrl: (id: number) => string;
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
}
