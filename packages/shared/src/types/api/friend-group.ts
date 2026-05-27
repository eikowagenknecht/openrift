import type { CardType, Finish, Rarity } from "../enums.js";
import type { ListEntryDetailResponse, ListIntent, ListKind } from "./list.js";

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
}

export interface FriendGroupMemberResponse {
  userId: string;
  userName: string | null;
  userImage: string | null;
  role: FriendGroupRole;
  nickname: string | null;
  joinedAt: string;
}

export interface FriendGroupShareResponse {
  groupId: string;
  listId: string;
  listName: string;
  listIntent: ListIntent;
  listKind: ListKind;
  userId: string;
  userName: string | null;
  sharedAt: string;
}

export interface FriendGroupRequestResponse {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
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
  ownerName: string | null;
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
}

export interface FriendGroupShareableListsResponse {
  items: FriendGroupShareableListResponse[];
}

export interface FriendGroupMatchRow {
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyNickname: string | null;
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
}

export interface FriendGroupMatchesResponse {
  othersHaveYourWants: FriendGroupMatchRow[];
  othersWantYourHaves: FriendGroupMatchRow[];
}

export interface FriendGroupMemberDetailResponse {
  member: FriendGroupMemberResponse;
  shares: FriendGroupShareResponse[];
  matches: FriendGroupMatchRow[];
  reverseMatches: FriendGroupMatchRow[];
}

export interface FriendGroupPendingInvitesCountResponse {
  count: number;
}

export interface ListGroupSharesResponse {
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
  };
  entries: ListEntryDetailResponse[];
}
