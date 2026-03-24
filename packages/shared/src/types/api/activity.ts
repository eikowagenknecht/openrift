import type { ActivityAction, ActivityType, CardType, Rarity } from "../enums.js";

export interface ActivityResponse {
  id: string;
  type: ActivityType;
  name: string | null;
  date: string;
  description: string | null;
  isAuto: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItemResponse {
  id: string;
  activityId: string;
  activityType: ActivityType;
  copyId: string | null;
  printingId: string;
  action: ActivityAction;
  fromCollectionId: string | null;
  fromCollectionName: string | null;
  toCollectionId: string | null;
  toCollectionName: string | null;
  metadataSnapshot: unknown;
  createdAt: string;
  setId: string;
  collectorNumber: number;
  rarity: Rarity;
  imageUrl: string | null;
  cardName: string;
  cardType: CardType;
}

export interface ActivityDetailResponse {
  activity: ActivityResponse;
  items: ActivityItemResponse[];
}

export interface ActivityListResponse {
  items: ActivityResponse[];
  nextCursor: string | null;
}
