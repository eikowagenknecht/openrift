// In-app trade execution DTOs (ADR-019). These are derived from the
// `cardTrade*ResponseSchema` contract schemas in `contracts/card-trades.ts`.

import type {
  cardTradeActionCountsResponseSchema,
  cardTradeCounterpartySchema,
  cardTradeListResponseSchema,
  cardTradeResponseSchema,
} from "@openrift/shared/contracts/card-trades";
import type { z } from "zod";

/** The viewer's side of a trade. */
export type CardTradeRole = "giver" | "receiver";

/** Who started the trade. The party who must accept is always the non-initiator. */
export type CardTradeInitiator = "giver" | "receiver";

export type CardTradeStatus =
  | "pending"
  | "reserved"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

/** The viewer's primary contextual action on a trade row, or `null` when none. */
export type CardTradeActionNeeded = "accept-or-decline" | "cancel" | "complete" | "apply-sync";

export type CardTradeCounterparty = z.infer<typeof cardTradeCounterpartySchema>;

/**
 * One trade, oriented to the viewer. `role` is the viewer's side; `counterparty`
 * is always the other party. Card name/image are resolved client-side from the
 * loaded catalog by `printingId`/`cardId`, exactly as match rows and copies do.
 */
export type CardTradeResponse = z.infer<typeof cardTradeResponseSchema>;

export type CardTradeListResponse = z.infer<typeof cardTradeListResponseSchema>;

/** Per-group count of trades needing the viewer's action (accept/decline or apply-sync). */
export type CardTradeActionCountsResponse = z.infer<typeof cardTradeActionCountsResponseSchema>;
