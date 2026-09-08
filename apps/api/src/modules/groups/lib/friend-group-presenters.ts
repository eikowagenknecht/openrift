import type { ContactMethod } from "@openrift/shared/types/api/contact-method";
import type {
  FriendGroupCollectionShareResponse,
  FriendGroupMemberPreview,
  FriendGroupMemberResponse,
  FriendGroupRequestResponse,
  FriendGroupResponse,
  FriendGroupRole,
  FriendGroupShareResponse,
} from "@openrift/shared/types/api/friend-group";

import { gravatarHashForEmail } from "../../users/lib/gravatar.js";
import type { Group, MemberPreviewRow, MemberWithUser } from "../repositories/friend-groups.js";
import { hasRole } from "./group-access.js";

/** Max cover printings per shared collection (a CardFan holds four). */
export const COLLECTION_COVER_COUNT = 4;

export interface ShareRow {
  groupId: string;
  listId: string;
  userId: string;
  sharedAt: Date;
  listName: string;
  listIntent: string;
  listKind: string;
  entryCount: number;
  userName: string | null;
}

export interface CollectionShareRow {
  groupId: string;
  collectionId: string;
  userId: string;
  sharedAt: Date;
  collectionName: string;
  userName: string | null;
  copyCount: number;
}

export interface CollectionCoverRow {
  collectionId: string;
  printingId: string;
  imageId: string;
}

export interface PendingRequestRow {
  id: string;
  userId: string;
  createdAt: Date;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

export function toGroup(row: Group, includeCode: boolean): FriendGroupResponse {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    code: includeCode ? row.code : null,
    codeRotatedAt: row.codeRotatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toMemberPreview(row: MemberPreviewRow): FriendGroupMemberPreview {
  return {
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
  };
}

export function toMember(
  row: MemberWithUser,
  contactMethods: ContactMethod[],
): FriendGroupMemberResponse {
  return {
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
    role: row.role,
    contactMethods,
    joinedAt: row.joinedAt.toISOString(),
  };
}

export function toShare(row: ShareRow): FriendGroupShareResponse {
  return {
    groupId: row.groupId,
    listId: row.listId,
    listName: row.listName,
    listIntent: row.listIntent as FriendGroupShareResponse["listIntent"],
    listKind: row.listKind as FriendGroupShareResponse["listKind"],
    entryCount: row.entryCount,
    userId: row.userId,
    userName: row.userName,
    sharedAt: row.sharedAt.toISOString(),
  };
}

export function groupCovers(rows: CollectionCoverRow[]): Map<string, CollectionCoverRow[]> {
  return Map.groupBy(rows, (row) => row.collectionId);
}

export function toCollectionShare(
  row: CollectionShareRow,
  covers?: CollectionCoverRow[],
): FriendGroupCollectionShareResponse {
  return {
    groupId: row.groupId,
    collectionId: row.collectionId,
    collectionName: row.collectionName,
    userId: row.userId,
    userName: row.userName,
    sharedAt: row.sharedAt.toISOString(),
    copyCount: row.copyCount,
    coverPrintings: (covers ?? []).map((cover) => ({
      printingId: cover.printingId,
      imageId: cover.imageId,
    })),
  };
}

export function toRequest(row: PendingRequestRow): FriendGroupRequestResponse {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userImage: row.userImage,
    gravatarHash: gravatarHashForEmail(row.userEmail),
    createdAt: row.createdAt.toISOString(),
  };
}

export function canSeeCode(role: FriendGroupRole): boolean {
  return hasRole(role, "admin");
}
