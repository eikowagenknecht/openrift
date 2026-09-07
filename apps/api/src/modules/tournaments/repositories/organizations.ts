import type { OrganizationRole } from "@openrift/shared/types/api/tournament";
import type { ExpressionBuilder, Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  OrganizationMembersTable,
  OrganizationsTable,
} from "../../../db/tables/organizations.js";

/** The "owner" shown in a listing is the longest-standing `role = 'owner'` member. */
function ownerNameSubquery(eb: ExpressionBuilder<Database & { o: OrganizationsTable }, "o">) {
  return eb
    .selectFrom("organizationMembers as om")
    .leftJoin("users as ou", "ou.id", "om.userId")
    .select("ou.name")
    .whereRef("om.orgId", "=", "o.id")
    .where("om.role", "=", "owner")
    .orderBy("om.joinedAt", "asc")
    .limit(1);
}

export type Organization = Selectable<OrganizationsTable>;
export type OrganizationMember = Selectable<OrganizationMembersTable>;

export interface OrganizationSummary extends Organization {
  ownerName: string | null;
  memberCount: number;
}

export interface OrganizationMemberWithName {
  userId: string;
  name: string | null;
  role: OrganizationRole;
  joinedAt: Date;
}

export interface NewOrganization {
  slug: string;
  name: string;
  description?: string | null;
  ownerUserId: string;
}

export interface OrganizationPatch {
  slug?: string;
  name?: string;
  description?: string | null;
}

/** Both `owner` and `manager` inherit organizer authority on every tournament the org hosts. */
export function organizationsRepo(db: Kysely<Database>) {
  return {
    create(input: NewOrganization): Promise<Organization> {
      // A deferred owner-guard trigger checks at commit that the org has an
      // owner-role member, so this must run in one transaction.
      return db.transaction().execute(async (trx) => {
        const org = await trx
          .insertInto("organizations")
          .values({
            slug: input.slug,
            name: input.name,
            description: input.description ?? null,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await trx
          .insertInto("organizationMembers")
          .values({ orgId: org.id, userId: input.ownerUserId, role: "owner" })
          .onConflict((oc) => oc.columns(["orgId", "userId"]).doUpdateSet({ role: "owner" }))
          .execute();
        return org;
      });
    },

    findBySlug(slug: string): Promise<Organization | undefined> {
      return db.selectFrom("organizations").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    findById(id: string): Promise<Organization | undefined> {
      return db.selectFrom("organizations").selectAll().where("id", "=", id).executeTakeFirst();
    },

    findByIds(ids: string[]): Promise<Organization[]> {
      if (ids.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .selectFrom("organizations")
        .selectAll()
        .where("id", "in", [...new Set(ids)])
        .execute();
    },

    async listAll(): Promise<OrganizationSummary[]> {
      const rows = await db
        .selectFrom("organizations as o")
        .selectAll("o")
        .select((eb) => [
          ownerNameSubquery(eb).as("ownerName"),
          eb
            .selectFrom("organizationMembers as m")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("m.orgId", "=", "o.id")
            .as("memberCount"),
        ])
        .orderBy("o.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...row,
        ownerName: row.ownerName ?? null,
        memberCount: Number(row.memberCount ?? 0),
      }));
    },

    async listIdsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("organizationMembers")
        .select("orgId")
        .where("userId", "=", userId)
        .where("role", "in", ["owner", "manager"])
        .execute();
      return rows.map((row) => row.orgId);
    },

    async listJudgeOrgIdsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("organizationMembers")
        .select("orgId")
        .where("userId", "=", userId)
        .where("role", "=", "judge")
        .execute();
      return rows.map((row) => row.orgId);
    },

    async listForUser(userId: string): Promise<OrganizationSummary[]> {
      const rows = await db
        .selectFrom("organizations as o")
        .selectAll("o")
        .select((eb) => [
          ownerNameSubquery(eb).as("ownerName"),
          eb
            .selectFrom("organizationMembers as m")
            .select(eb.fn.countAll<number>().as("c"))
            .whereRef("m.orgId", "=", "o.id")
            .as("memberCount"),
        ])
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom("organizationMembers as m")
              .select("m.userId")
              .whereRef("m.orgId", "=", "o.id")
              .where("m.userId", "=", userId)
              .where("m.role", "in", ["owner", "manager"]),
          ),
        )
        .orderBy("o.createdAt", "desc")
        .execute();
      return rows.map((row) => ({
        ...row,
        ownerName: row.ownerName ?? null,
        memberCount: Number(row.memberCount ?? 0),
      }));
    },

    update(id: string, patch: OrganizationPatch): Promise<Organization | undefined> {
      return db
        .updateTable("organizations")
        .set({ ...patch, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    async deleteById(id: string): Promise<{ numDeletedRows: bigint }> {
      const result = await db.deleteFrom("organizations").where("id", "=", id).executeTakeFirst();
      return { numDeletedRows: result.numDeletedRows };
    },

    listMembers(orgId: string): Promise<OrganizationMemberWithName[]> {
      return db
        .selectFrom("organizationMembers as m")
        .leftJoin("users as u", "u.id", "m.userId")
        .select(["m.userId", "u.name as name", "m.role", "m.joinedAt"])
        .where("m.orgId", "=", orgId)
        .orderBy("m.joinedAt", "asc")
        .execute();
    },

    getMembership(orgId: string, userId: string): Promise<OrganizationMember | undefined> {
      return db
        .selectFrom("organizationMembers")
        .selectAll()
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    async addMember(orgId: string, userId: string, role: OrganizationRole): Promise<void> {
      await db
        .insertInto("organizationMembers")
        .values({ orgId, userId, role })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doUpdateSet({ role }))
        .execute();
    },

    async updateMemberRole(orgId: string, userId: string, role: OrganizationRole): Promise<void> {
      await db
        .updateTable("organizationMembers")
        .set({ role })
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .execute();
    },

    async removeMember(orgId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("organizationMembers")
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Call inside a transaction before a count-then-mutate guard, to
     * serialize concurrent member mutations against the read.
     */
    async lockForUpdate(orgId: string): Promise<void> {
      await db
        .selectFrom("organizations")
        .select("id")
        .where("id", "=", orgId)
        .forUpdate()
        .execute();
    },

    async countOwners(orgId: string): Promise<number> {
      const row = await db
        .selectFrom("organizationMembers")
        .select((eb) => eb.fn.countAll<number>().as("c"))
        .where("orgId", "=", orgId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      return Number(row?.c ?? 0);
    },
  };
}
