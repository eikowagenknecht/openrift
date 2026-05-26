import type { CardType, Finish, Rarity } from "../enums.js";

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
}

export interface ListListResponse {
  items: ListResponse[];
}

interface ListEntryBase {
  id: string;
  listId: string;
  quantity: number;
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
      imageId: string | null;
    })
  | (ListEntryDetailBase & {
      kind: "copy";
      copyId: string;
      printingId: string;
      collectionId: string;
      setId: string;
      rarity: Rarity;
      finish: Finish;
      imageId: string | null;
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
}

export interface PublicListDetailResponse {
  list: PublicListResponse;
  entries: ListEntryDetailResponse[];
  owner: { displayName: string };
}

export interface ListShareResponse {
  shareToken: string;
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
