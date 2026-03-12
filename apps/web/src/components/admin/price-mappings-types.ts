export interface SourceMappingConfig {
  source: string;
  displayName: string;
  shortName: string;
  productUrl: (id: number) => string;
  apiPath: string;
}

export interface MappingPrinting {
  printingId: string;
  sourceId: string;
  rarity: string;
  artVariant: string;
  isSigned: boolean;
  isPromo: boolean;
  finish: string;
  collectorNumber: number;
  imageUrl: string;
  externalId: number | null;
}

export interface StagedProduct {
  externalId: number;
  productName: string;
  finish: string;
  marketCents: number;
  lowCents: number | null;
  currency: string;
  recordedAt: string;
  midCents: number | null;
  highCents: number | null;
  trendCents: number | null;
  avg1Cents: number | null;
  avg7Cents: number | null;
  avg30Cents: number | null;
  isOverride?: boolean;
  groupId?: number;
  groupName?: string;
}

export interface MappingGroup {
  cardId: string;
  cardName: string;
  cardType: string;
  superTypes: string[];
  domains: string[];
  energy: number | null;
  might: number | null;
  setId: string;
  setName: string;
  printings: MappingPrinting[];
  stagedProducts: StagedProduct[];
  assignedProducts: StagedProduct[];
}

export interface AssignableCard {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  printings: {
    printingId: string;
    sourceId: string;
    finish: string;
    collectorNumber: number;
    isSigned: boolean;
    isPromo: boolean;
    externalId: number | null;
  }[];
}
