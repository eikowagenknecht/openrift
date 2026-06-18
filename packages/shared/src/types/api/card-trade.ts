// In-app trade execution DTOs (ADR-019). These mirror `cardTrade*ResponseSchema`
// in `response-schemas.ts`; keep the two in sync.

import type { ContactMethod } from "./contact-method.js";

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

export interface CardTradeCounterparty {
  userId: string;
  name: string | null;
  image: string | null;
  /** SHA-256 of the lowercased email — Gravatar fallback without leaking the email. */
  gravatarHash: string;
  /** Contact channels the counterparty revealed to this group — how to arrange the swap (ADR-013). */
  contactMethods: ContactMethod[];
}

/**
 * One trade, oriented to the viewer. `role` is the viewer's side; `counterparty`
 * is always the other party. Card name/image are resolved client-side from the
 * loaded catalog by `printingId`/`cardId`, exactly as match rows and copies do.
 */
export interface CardTradeResponse {
  id: string;
  groupId: string;
  groupSlug: string;
  /** The viewer's side of this trade. */
  role: CardTradeRole;
  initiator: CardTradeInitiator;
  counterparty: CardTradeCounterparty;
  printingId: string;
  cardId: string;
  quantity: number;
  status: CardTradeStatus;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  expiresAt: string | null;
  viewerSyncAppliedAt: string | null;
  counterpartySyncAppliedAt: string | null;
  /** The viewer's primary contextual action, or `null`. Status/role/sync-derived. */
  actionNeeded: CardTradeActionNeeded | null;
}

export interface CardTradeListResponse {
  items: CardTradeResponse[];
}

/** Per-group count of trades needing the viewer's action (accept/decline or apply-sync). */
export interface CardTradeActionCountsResponse {
  /** Sum of all per-group counts (the combined "Groups" header badge). */
  total: number;
  byGroup: { groupId: string; groupSlug: string; count: number }[];
}
