import type { ContactMethodType } from "@openrift/shared/types/api/contact-method";
import type {
  FriendGroupInviteDirection,
  FriendGroupRole,
} from "@openrift/shared/types/api/friend-group";
import type { ColumnType, Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

export interface FriendGroupsTable {
  id: Generated<string>;
  slug: string;
  previousSlug: string | null;
  name: string;
  description: string | null;
  code: string | null;
  codeRotatedAt: ColumnType<Date, Date | undefined, Date>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FriendGroupMembersTable {
  groupId: string;
  userId: string;
  role: FriendGroupRole;
  joinedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface UserContactMethodsTable {
  id: Generated<string>;
  userId: string;
  type: ContactMethodType;
  value: string;
  sortOrder: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface FriendGroupMemberContactsTable {
  groupId: string;
  userId: string;
  contactMethodId: string;
}

export interface FriendGroupInvitesTable {
  id: Generated<string>;
  groupId: string;
  userId: string;
  direction: FriendGroupInviteDirection;
  createdAt: CreatedAt;
}

export interface FriendGroupListSharesTable {
  groupId: string;
  listId: string;
  userId: string;
  sharedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface FriendGroupCollectionSharesTable {
  groupId: string;
  collectionId: string;
  userId: string;
  sharedAt: ColumnType<Date, Date | undefined, Date>;
}

export interface FriendGroupDiscordLinksTable {
  id: Generated<string>;
  groupId: string;
  guildId: string | null;
  guildName: string | null;
  code: string | null;
  codeExpiresAt: Date | null;
  createdByUserId: string | null;
  createdAt: CreatedAt;
  linkedAt: Date | null;
  tradeChannelIds: Generated<string[]>;
}
