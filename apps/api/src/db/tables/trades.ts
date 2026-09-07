import type { CardTradeInitiator, CardTradeStatus } from "@openrift/shared/types/api/card-trade";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface CardTradesTable {
  id: Generated<string>;
  groupId: string | null;
  groupName: string | null;
  giverUserId: string | null;
  giverName: string | null;
  receiverUserId: string | null;
  receiverName: string | null;
  initiator: CardTradeInitiator;
  printingId: string;
  cardId: string;
  quantity: number;
  status: Generated<CardTradeStatus>;
  receiverWishEntryId: string | null;
  lastActorUserId: string | null;
  giverSyncAppliedAt: Date | null;
  receiverSyncAppliedAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  acceptedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date | null;
  requestEmailSentAt: Date | null;
  reservedEmailSentAt: Date | null;
  closedEmailSentAt: Date | null;
}

export interface CardTradeCopiesTable {
  tradeId: string;
  copyId: string;
}
