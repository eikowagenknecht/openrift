import type { OverlayPayload } from "@openrift/shared/contracts/overlay";
import type { StagePresetConfig } from "@openrift/shared/contracts/stage-presets";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface OverlayChannelsTable {
  id: Generated<string>;
  userId: string;
  token: string;
  payload: ColumnType<OverlayPayload, OverlayPayload | undefined, OverlayPayload>;
  version: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface StagePresetsTable {
  id: Generated<string>;
  userId: string;
  name: string;
  config: ColumnType<StagePresetConfig, StagePresetConfig | undefined, StagePresetConfig>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface TierListCard {
  cardId: string;
  printingId: string | null;
}

export interface TierListRow {
  label: string;
  cards: TierListCard[];
  unranked?: boolean;
}

export interface TierListsTable {
  id: Generated<string>;
  userId: string;
  title: string;
  description: string | null;
  tiers: Generated<TierListRow[]>;
  isPublic: Generated<boolean>;
  shareToken: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}
