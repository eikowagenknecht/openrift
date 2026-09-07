import type {
  MappingGroupHeader,
  MappingPrintingResponse,
  StagedProductResponse,
} from "@openrift/shared/types/api/admin";

export type {
  AssignableCardResponse as AssignableCard,
  MappingPrintingResponse as MappingPrinting,
  MarketplaceAssignmentResponse as MarketplaceAssignment,
  StagedProductResponse as StagedProduct,
  UnifiedMappingGroupResponse as UnifiedMappingGroup,
  UnifiedMappingPrintingResponse as UnifiedMappingPrinting,
} from "@openrift/shared/types/api/admin";

export interface SourceMappingConfig {
  source: string;
  displayName: string;
  shortName: string;
  productUrl: (id: number, language?: string | null) => string;
}

export interface MappingGroup extends MappingGroupHeader {
  printings: MappingPrintingResponse[];
  stagedProducts: StagedProductResponse[];
  assignedProducts: StagedProductResponse[];
  /** Key: `${externalId}|${finish}` */
  crossLanguageEvidence?: ReadonlyMap<string, ReadonlySet<string>>;
}
