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
  cardTradeSheetGroupSchema,
  cardTradeSheetMatchRowSchema,
  cardTradeSheetResponseSchema,
} from "@openrift/shared/contracts/card-trades";
import type { z } from "zod";

export type CardTradeRole = "giver" | "receiver";

/** The party who must accept is always the non-initiator. */
export type CardTradeInitiator = "giver" | "receiver";

export type CardTradeStatus = (typeof CARD_TRADE_STATUSES)[number];

/** `settle` covers the viewer's own half of a reserved swap; the second settle promotes the trade. */
export type CardTradeActionNeeded = "accept-or-decline" | "cancel" | "settle";

export type CardTradeCounterparty = z.infer<typeof cardTradeCounterpartySchema>;

/** Card name/image are resolved client-side from the loaded catalog by `printingId`/`cardId`. */
export type CardTradeResponse = z.infer<typeof cardTradeResponseSchema>;

export type CardTradeListResponse = z.infer<typeof cardTradeListResponseSchema>;

export type CardTradeActionCountsResponse = z.infer<typeof cardTradeActionCountsResponseSchema>;

export type CardTradeCopyOption = z.infer<typeof cardTradeCopyOptionSchema>;

/** `choiceMatters` says whether the client should ask the giver to pick. */
export type CardTradeCopyOptionsResponse = z.infer<typeof cardTradeCopyOptionsResponseSchema>;

export type CardTradeLivePhase = z.infer<typeof cardTradeLivePhaseSchema>;

export type CardTradeLiveAnnotation = z.infer<typeof cardTradeLiveAnnotationSchema>;

/** Aggregated per (printing, role, phase). */
export type CardTradeLiveByPrintingResponse = z.infer<typeof cardTradeLiveByPrintingResponseSchema>;

export type CardTradeSheetGroup = z.infer<typeof cardTradeSheetGroupSchema>;

export type CardTradeSheetMatchRow = z.infer<typeof cardTradeSheetMatchRowSchema>;

/** Pooled across every shared group with that counterparty. */
export type CardTradeSheetResponse = z.infer<typeof cardTradeSheetResponseSchema>;
