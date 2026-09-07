import type { DeckOddsConfig } from "@openrift/shared/contracts/decks";
import type { DeckFormatConfig, DeckLink } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface DecksTable {
  id: Generated<string>;
  userId: string;
  name: string;
  description: string | null;
  format: DeckFormat;
  formatConfig: DeckFormatConfig | null;
  oddsConfig: DeckOddsConfig | null;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  isPinned: Generated<boolean>;
  archivedAt: Date | null;
  coverCardId: string | null;
  coverPrintingId: string | null;
  coverPosition: number | null;
  links: ColumnType<DeckLink[], DeckLink[] | undefined, DeckLink[]>;
  collectionId: string | null;
  familyId: string | null;
  predecessorDeckId: string | null;
  isPrimary: Generated<boolean>;
  isDraft: Generated<boolean>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckCardsTable {
  id: Generated<string>;
  deckId: string;
  cardId: string;
  zone: DeckZone;
  quantity: Generated<number>;
  preferredPrintingId: string | null;
}

export interface DeckPlansTable {
  id: Generated<string>;
  deckId: string;
  generalStrategy: Generated<string>;
  mulliganSplit: Generated<boolean>;
  mulliganGeneral: Generated<string>;
  mulliganFirst: Generated<string>;
  mulliganSecond: Generated<string>;
  battlefieldG1CardId: string | null;
  battlefieldFirstCardId: string | null;
  battlefieldSecondCardId: string | null;
  battlefieldCustom: Generated<boolean>;
  battlefieldNote: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckMatchupPlansTable {
  id: Generated<string>;
  deckId: string;
  opponentCardId: string | null;
  opponentLabel: Generated<string>;
  notes: Generated<string>;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckMatchupSwapsTable {
  id: Generated<string>;
  planId: string;
  cardId: string;
  direction: "in" | "out";
  quantity: number;
}

export interface DeckFoldersTable {
  id: Generated<string>;
  userId: string;
  name: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface DeckFolderEntriesTable {
  folderId: string;
  deckId: string;
  userId: string;
  createdAt: CreatedAt;
}
