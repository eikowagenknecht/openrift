import type { CardType, Finish, Rarity } from "../enums.js";
import type { Currency, TradePreference } from "./trade-preferences.js";

export type ListIntent = "wish" | "trade" | "organize";

/** Granularity the list tracks. Each list contains uniformly one kind. */
export type ListKind = "card" | "printing" | "copy";

export interface ListResponse {
  id: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  /** Number of entries in this list. Unit depends on `kind` (cards/printings/copies). */
  entryCount: number;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * List-level default preference (ADR-017). All fields are `null` when no
   * default has been set or when `intent === "organize"`. Entries inherit
   * field-by-field via {@link resolveEffectiveTradePreference}.
   */
  tradeDefaults: TradePreference;
  /** Currency used for `absolute` prices. Always `null` on `organize` lists. */
  currency: Currency | null;
}

export interface ListListResponse {
  items: ListResponse[];
}

interface ListEntryBase {
  id: string;
  listId: string;
  quantity: number;
  /**
   * Per-entry override (ADR-017). NULL fields fall through to the parent list's
   * `tradeDefaults`. Always all-NULL on `organize` lists.
   */
  tradeOverride: TradePreference;
}

/**
 * Bare entry row. Discriminated on `kind` — each variant carries exactly the
 * target id that matches its kind. Mirrors the DB shape check
 * `chk_list_entries_kind_shape` from migration 133.
 */
export type ListEntryResponse =
  | (ListEntryBase & { kind: "card"; cardId: string })
  | (ListEntryBase & { kind: "printing"; printingId: string })
  | (ListEntryBase & { kind: "copy"; copyId: string });

interface ListEntryDetailBase extends ListEntryBase {
  cardName: string;
  cardType: CardType;
}

/**
 * Enriched entry row. Joined with card/printing/copy details on the server.
 * `printing` and `copy` variants both carry a non-null `printingId` (for copy
 * it's the printing under the physical copy) so the client can look up a
 * thumbnail directly. `card` variant has no printing — the client picks a
 * representative from the catalog.
 */
export type ListEntryDetailResponse =
  | (ListEntryDetailBase & {
      kind: "card";
      cardId: string;
    })
  | (ListEntryDetailBase & {
      kind: "printing";
      printingId: string;
      setId: string;
      rarity: Rarity;
      finish: Finish;
      shortCode: string;
      language: string;
      imageId: string | null;
    })
  | (ListEntryDetailBase & {
      kind: "copy";
      copyId: string;
      printingId: string;
      setId: string;
      rarity: Rarity;
      finish: Finish;
      shortCode: string;
      language: string;
      imageId: string | null;
      /** True when the copy is pinned to a live in-app trade (ADR-019). */
      reserved: boolean;
    });

export interface ListDetailResponse {
  list: ListResponse;
  entries: ListEntryDetailResponse[];
}

export interface PublicListResponse {
  id: string;
  name: string;
  intent: ListIntent;
  kind: ListKind;
  createdAt: string;
  updatedAt: string;
  tradeDefaults: TradePreference;
  currency: Currency | null;
}

export interface PublicListDetailResponse {
  list: PublicListResponse;
  entries: ListEntryDetailResponse[];
  owner: { displayName: string; gravatarHash: string | null };
}

export interface ListShareResponse {
  /**
   * Null only for an owned-but-unshared list reported by GET
   * /lists/{id}/share. Share / rotate always return a non-null token.
   */
  shareToken: string | null;
  isPublic: boolean;
}

export interface ListBulkAddResponse {
  /** Brand-new entries created. */
  added: number;
  /** Existing entries whose quantity was incremented. */
  updated: number;
  /** Inputs that produced neither — non-owned copies, etc. */
  skipped: number;
}

export interface ListMoveResponse {
  /**
   * Source entries successfully removed. May be less than the requested count
   * if some entries were stale (already deleted, or no longer on the source).
   */
  moved: number;
  /**
   * Of the moved entries, how many landed on an existing destination entry —
   * for card / printing kind that means quantity was summed; for copy kind
   * that means the source entry was discarded because the same copy was
   * already on the destination.
   */
  merged: number;
}
