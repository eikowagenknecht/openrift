import type { OrganizationRole } from "@openrift/shared/types/api/tournament";
import type { Generated } from "kysely";

import type { CreatedAt, UpdatedAt } from "./columns.js";

// A deferred constraint trigger keeps every org at one owner-role member or more.

export interface OrganizationsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  description: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface OrganizationMembersTable {
  orgId: string;
  userId: string;
  role: OrganizationRole;
  joinedAt: CreatedAt;
}
