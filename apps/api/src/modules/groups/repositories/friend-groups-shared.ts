import type { Insertable, Selectable, Updateable } from "kysely";

import type {
  FriendGroupCollectionSharesTable,
  FriendGroupInvitesTable,
  FriendGroupListSharesTable,
  FriendGroupMembersTable,
  FriendGroupsTable,
} from "../../../db/tables/friend-groups.js";

export type Group = Selectable<FriendGroupsTable>;
export type GroupMember = Selectable<FriendGroupMembersTable>;
export type GroupInvite = Selectable<FriendGroupInvitesTable>;
export type GroupShare = Selectable<FriendGroupListSharesTable>;
export type GroupCollectionShare = Selectable<FriendGroupCollectionSharesTable>;

export type NewGroupValues = Pick<
  Insertable<FriendGroupsTable>,
  "slug" | "name" | "description" | "code"
>;

export type GroupUpdate = Pick<
  Updateable<FriendGroupsTable>,
  "slug" | "previousSlug" | "name" | "description" | "updatedAt"
>;

export interface MemberWithUser extends GroupMember {
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}

export interface SharedGroupRow {
  id: string;
  slug: string;
  name: string;
}

export interface MemberPreviewRow {
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
}
