// In-app trade execution DTOs (ADR-019). These are derived from the
// `cardTrade*ResponseSchema` contract schemas in `contracts/card-trades.ts`.

import type {
  CARD_TRADE_STATUSES,
  cardTradeActionCountsResponseSchema,
  cardTradeCopyOptionSchema,
  cardTradeCopyOptionsResponseSchema,
  cardTradeCounterpartySchema,
  cardTradeListResponseSchema,
  cardTradeLiveAnnotationSchema,
  cardTradeLiveByPrintingResponseSchema,
  cardTradeLivePhaseSchema,
  cardTradeResponseSchema,
} from "@openrift/shared/contracts/card-trades";
import type { z } from "zod";

/** The viewer's side of a trade. */
export type CardTradeRole = "giver" | "receiver";

/** Who started the trade. The party who must accept is always the non-initiator. */
export type CardTradeInitiator = "giver" | "receiver";

export type CardTradeStatus = (typeof CARD_TRADE_STATUSES)[number];

/**
 * The viewer's primary contextual action on a trade row, or `null` when none.
 * `settle` covers the viewer's own half of a reserved swap (hand over / receive),
 * which also carries the optional collection change. There is no separate
 * completion step: the second settle promotes the trade (ADR-019, amendment
 * 2026-08-10).
 */
export type CardTradeActionNeeded = "accept-or-decline" | "cancel" | "settle";

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

/** One physical copy the giver could promise to a pending trade. */
export type CardTradeCopyOption = z.infer<typeof cardTradeCopyOptionSchema>;

/**
 * The candidate copies behind a pending trade, in the server's default pin
 * order. `choiceMatters` says whether the client should ask the giver to pick.
 */
export type CardTradeCopyOptionsResponse = z.infer<typeof cardTradeCopyOptionsResponseSchema>;

/** How far along a live trade is, from the viewer's side. */
export type CardTradeLivePhase = z.infer<typeof cardTradeLivePhaseSchema>;

/** The viewer's live trades on one printing, from one side, in one phase. */
export type CardTradeLiveAnnotation = z.infer<typeof cardTradeLiveAnnotationSchema>;

/** Every live trade the viewer has, aggregated per (printing, role, phase). */
export type CardTradeLiveByPrintingResponse = z.infer<typeof cardTradeLiveByPrintingResponseSchema>;
