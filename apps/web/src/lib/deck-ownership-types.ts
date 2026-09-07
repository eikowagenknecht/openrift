import type { Rarity } from "@openrift/shared/types/enums";

export interface OwnershipPrinting {
  id: string;
  language: string;
  shortCode: string;
  setId: string;
  rarity: Rarity;
  imageId: string | undefined;
  landscape: boolean;
}

export interface CardOwnership {
  cardId: string;
  cardName: string;
  cardSlug: string | undefined;
  displayName: string;
  zone: string;
  needed: number;
  owned: number;
  shortfall: number;
  locked: number;
  lockedLoaned: number;
  lockedReserved: number;
  lockedExcluded: number;
  borrowed: number;
  incoming: number;
  displayPrice: number | undefined;
  displayPrinting: OwnershipPrinting | undefined;
  cheapestPrice: number | undefined;
  cheapestPrinting: OwnershipPrinting | undefined;
}

export interface DeckOwnershipData {
  byCardZone: Map<string, CardOwnership>;
  totalNeeded: number;
  totalOwned: number;
  requiredZoneNeeded: number;
  requiredZoneOwned: number;
  ownedPrintingByCardId: ReadonlyMap<string, OwnershipPrinting>;
  totalLocked: number;
  totalBorrowed: number;
  totalIncoming: number;
  missingCount: number;
  requiredZoneMissing: number;
  sideboardMissing: number;
  deckValueCents: number | undefined;
  mainValueCents: number | undefined;
  sideboardValueCents: number | undefined;
  asDisplayedValueCents: number | undefined;
  missingValueCents: number | undefined;
  missingMainValueCents: number | undefined;
  missingSideboardValueCents: number | undefined;
  missingAsDisplayedValueCents: number | undefined;
  missingCards: CardOwnership[];
}
