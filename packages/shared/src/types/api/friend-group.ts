import type { CardType, Finish, Rarity } from "../enums.js";
import type { ContactMethod } from "./contact-method.js";
import type { ListEntryDetailResponse, ListIntent, ListKind } from "./list.js";
import type { Currency, EffectiveTradePreference, TradePreference } from "./trade-preferences.js";

// ADR-033 retired the `judge` role: judging now lives in tournament_staff.
export type FriendGroupRole = "owner" | "admin" | "member";
export type FriendGroupInviteDirection = "invite" | "request";

export interface FriendGroupResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** `null` when the group has disabled code-based joining. */
  code: string | null;
  codeRotatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FriendGroupSummaryResponse extends FriendGroupResponse {
  viewerRole: FriendGroupRole;
  memberCount: number;
  pendingRequestCount: number;
}

export interface FriendGroupPendingInviteResponse {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  createdAt: string;
}

export interface FriendGroupListResponse {
  items: FriendGroupSummaryResponse[];
  pendingInvites: FriendGroupPendingInviteResponse[];
  /** Join requests the viewer has sent that are still awaiting an admin's approval. */
  outgoingRequests: FriendGroupPendingInviteResponse[];
}

export interface FriendGroupMemberResponse {
  userId: string;
  userName: string | null;
  userImage: string | null;
  /** SHA-256 of the lowercased email — drives a Gravatar fallback without leaking the email. */
  gravatarHash: string;
  role: FriendGroupRole;
  /** Contact channels this member reveals to the group (account-level, opt-in per group). */
  contactMethods: ContactMethod[];
  joinedAt: string;
}

export interface FriendGroupShareResponse {
  groupId: string;
  listId: string;
  listName: string;
  listIntent: ListIntent;
  listKind: ListKind;
  entryCount: number;
  userId: string;
  userName: string | null;
  sharedAt: string;
}

export interface FriendGroupCollectionShareResponse {
  groupId: string;
  collectionId: string;
  collectionName: string;
  userId: string;
  userName: string | null;
  sharedAt: string;
  /** Total copies in the shared collection. */
  copyCount: number;
}

export interface FriendGroupRequestResponse {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  gravatarHash: string;
  createdAt: string;
}

export type FriendGroupViewerStatus = "member" | "pending";

export interface FriendGroupDetailResponse {
  group: FriendGroupResponse;
  viewerStatus: FriendGroupViewerStatus;
  /** `null` when `viewerStatus === "pending"`. */
  viewerRole: FriendGroupRole | null;
  /** Empty when `viewerStatus === "pending"`. */
  members: FriendGroupMemberResponse[];
  /** Empty when `viewerStatus === "pending"`. */
  shares: FriendGroupShareResponse[];
  /** Empty when `viewerStatus === "pending"`. */
  collectionShares: FriendGroupCollectionShareResponse[];
  /** Empty for plain members and pending users; populated for admins/owner. */
  pendingRequests: FriendGroupRequestResponse[];
}

export type FriendGroupJoinViewerStatus = "available" | "pending" | "member";

export interface FriendGroupJoinPreviewResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
  viewerStatus: FriendGroupJoinViewerStatus;
}

export interface FriendGroupShareableListResponse {
  listId: string;
  listName: string;
  listIntent: ListIntent;
  listKind: ListKind;
  entryCount: number;
  /** `null` when the list is not currently shared with this group. */
  sharedAt: string | null;
  tradeDefaults: TradePreference;
  currency: Currency | null;
}

export interface FriendGroupShareableListsResponse {
  items: FriendGroupShareableListResponse[];
}

export interface FriendGroupShareableCollectionResponse {
  collectionId: string;
  collectionName: string;
  /** `null` when the collection is not currently shared with this group. */
  sharedAt: string | null;
}

export interface FriendGroupShareableCollectionsResponse {
  items: FriendGroupShareableCollectionResponse[];
}

export interface FriendGroupMatchRow {
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;
  /** Counterparty's source list (their sell list when they "have", their buy list when they "want"). */
  counterpartyListId: string;
  counterpartyListName: string;
  sellEntryId: string;
  sellListId: string;
  copyId: string;
  printingId: string;
  cardId: string;
  cardName: string;
  cardType: CardType;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  imageId: string | null;
  buyEntryId: string;
  buyListId: string;
  buyEntryKind: "card" | "printing";
  buyQuantity: number;
  /**
   * Resolved (entry-override ?? list-default) preference of the counterparty's
   * sell side — "what they want for it" when the row is in `othersHaveYourWants`,
   * "what they'd pay" when in `othersWantYourHaves`.
   */
  sellPref: EffectiveTradePreference;
  /**
   * Resolved (entry-override ?? list-default) preference of the buy side —
   * "what you'd pay" / "what they want for it", mirror of `sellPref`.
   */
  buyPref: EffectiveTradePreference;
}

export interface FriendGroupMatchesResponse {
  othersHaveYourWants: FriendGroupMatchRow[];
  othersWantYourHaves: FriendGroupMatchRow[];
}

export interface FriendGroupMemberDetailResponse {
  member: FriendGroupMemberResponse;
  shares: FriendGroupShareResponse[];
  collectionShares: FriendGroupCollectionShareResponse[];
  matches: FriendGroupMatchRow[];
  reverseMatches: FriendGroupMatchRow[];
}

/**
 * One entry in a group's activity feed. A discriminated union over `kind`;
 * `at` is the ISO timestamp the feed sorts by (newest first).
 *
 * Card-bearing kinds (`trade-completed`, `match`) carry only `printingId` /
 * `cardId` — the client resolves the card name and image from its loaded
 * catalogue, the same way the trades and matches lists do.
 *
 * `match` is the one approximate kind: matches aren't stored, so `at` is the
 * latest of the timestamps that made the match possible (when both lists were
 * shared and both entries / the copy were created). It surfaces the viewer's
 * *incoming* matches only ("others now have something you want").
 */
export type FriendGroupActivityEvent =
  | {
      kind: "trade-completed";
      at: string;
      tradeId: string;
      printingId: string;
      cardId: string;
      quantity: number;
      giverUserId: string;
      giverName: string | null;
      receiverUserId: string;
      receiverName: string | null;
    }
  | {
      kind: "member-joined";
      at: string;
      userId: string;
      userName: string | null;
      userImage: string | null;
      gravatarHash: string;
    }
  | {
      kind: "list-shared";
      at: string;
      userId: string;
      userName: string | null;
      listId: string;
      listName: string;
      listIntent: ListIntent;
      listKind: ListKind;
    }
  | {
      kind: "collection-shared";
      at: string;
      userId: string;
      userName: string | null;
      collectionId: string;
      collectionName: string;
    }
  | {
      kind: "match";
      at: string;
      counterpartyUserId: string;
      counterpartyName: string | null;
      counterpartyImage: string | null;
      counterpartyGravatarHash: string;
      printingId: string;
      cardId: string;
    };

export interface FriendGroupActivityResponse {
  events: FriendGroupActivityEvent[];
}

export interface FriendGroupPendingInvitesCountResponse {
  count: number;
}

export interface FriendGroupPendingRequestsCountResponse {
  count: number;
}

export interface ListGroupSharesResponse {
  items: { groupId: string; groupSlug: string; groupName: string }[];
}

export interface CollectionGroupSharesResponse {
  items: { groupId: string; groupSlug: string; groupName: string }[];
}

export interface FriendGroupSharedListDetailResponse {
  list: {
    id: string;
    name: string;
    intent: ListIntent;
    kind: ListKind;
    ownerUserId: string;
    ownerName: string | null;
    tradeDefaults: TradePreference;
    currency: Currency | null;
  };
  entries: ListEntryDetailResponse[];
}

export interface FriendGroupSharedCollectionDetailResponse {
  collection: {
    id: string;
    name: string;
    description: string | null;
    copyCount: number;
    totalValueCents: number | null;
    unpricedCopyCount: number | null;
    ownerUserId: string;
    ownerName: string | null;
  };
  copies: { id: string; printingId: string; collectionId: string; groupId: string | null }[];
  viewerRole: FriendGroupRole;
}
