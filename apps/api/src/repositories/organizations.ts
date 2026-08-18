import type { OrganizationRole } from "@openrift/shared";
import type { ExpressionBuilder, Kysely, Selectable } from "kysely";

import type { Database, OrganizationMembersTable, OrganizationsTable } from "../db/index.js";

/**
 * Correlated subquery for the longest-standing owner's display name, shown in
 * the two summary listings. Ownership is the `role = 'owner'` membership rows
 * (migration 254), so the "owner" an admin list names is simply the oldest one.
 * @param eb An expression builder of a query with `organizations as o` in scope.
 * @returns A scalar subquery yielding the owner's user name (nullable).
 */
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

/** Admin-list row: the org plus its longest-standing owner's name and a member count. */
export interface OrganizationSummary extends Organization {
  ownerName: string | null;
  memberCount: number;
}

/** A member row joined to the user's display name. */
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
  /** Seeds the first `role = 'owner'` membership; ownership lives on the roles alone. */
  ownerUserId: string;
}

export interface OrganizationPatch {
  slug?: string;
  name?: string;
  description?: string | null;
}

/**
 * Event organizations (ADR-033): a first-class, admin-provisioned tournament
 * host (a local game store, a league). `organization_members` carries org-level
 * authority — both `owner` and `manager` inherit organizer authority on every
 * tournament the org hosts. Authorization is the caller's job; the repo is naive.
 *
 * @param db The Kysely database handle (or transaction).
 * @returns The repository methods.
 */
export function organizationsRepo(db: Kysely<Database>) {
  return {
    /**
     * Creates an organization and seeds its owner membership in one transaction.
     * @returns The created organization row.
     */
    create(input: NewOrganization): Promise<Organization> {
      // One transaction: the deferred owner-guard trigger (migration 254)
      // checks at commit that the org has an owner-role member.
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

    /** @returns The organization matched by slug, or undefined. */
    findBySlug(slug: string): Promise<Organization | undefined> {
      return db.selectFrom("organizations").selectAll().where("slug", "=", slug).executeTakeFirst();
    },

    /** @returns The organization matched by id, or undefined. */
    findById(id: string): Promise<Organization | undefined> {
      return db.selectFrom("organizations").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns The organizations matched by id (batch lookup). */
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

    /** @returns Every organization with its owner name and member count, newest first. */
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

    /**
     * @returns The ids of organizations the user can host for (owner or manager).
     * Excludes `judge` memberships, which carry no host authority.
     */
    async listIdsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("organizationMembers")
        .select("orgId")
        .where("userId", "=", userId)
        .where("role", "in", ["owner", "manager"])
        .execute();
      return rows.map((row) => row.orgId);
    },

    /** @returns The ids of organizations the user is a `judge` of (judge authority only). */
    async listJudgeOrgIdsForUser(userId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("organizationMembers")
        .select("orgId")
        .where("userId", "=", userId)
        .where("role", "=", "judge")
        .execute();
      return rows.map((row) => row.orgId);
    },

    /** @returns Organizations where the user is an owner or manager, newest first, as summaries. */
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

    /** @returns The updated organization, or undefined when it does not exist. */
    update(id: string, patch: OrganizationPatch): Promise<Organization | undefined> {
      return db
        .updateTable("organizations")
        .set({ ...patch, updatedAt: new Date() })
        .where("id", "=", id)
        .returningAll()
        .executeTakeFirst();
    },

    /** @returns The number of organizations deleted (0 when none matched). */
    async deleteById(id: string): Promise<{ numDeletedRows: bigint }> {
      const result = await db.deleteFrom("organizations").where("id", "=", id).executeTakeFirst();
      return { numDeletedRows: result.numDeletedRows };
    },

    /** @returns The organization's members joined to their display name, oldest first. */
    listMembers(orgId: string): Promise<OrganizationMemberWithName[]> {
      return db
        .selectFrom("organizationMembers as m")
        .leftJoin("users as u", "u.id", "m.userId")
        .select(["m.userId", "u.name as name", "m.role", "m.joinedAt"])
        .where("m.orgId", "=", orgId)
        .orderBy("m.joinedAt", "asc")
        .execute();
    },

    /** @returns The membership row, or undefined when the user is not a member. */
    getMembership(orgId: string, userId: string): Promise<OrganizationMember | undefined> {
      return db
        .selectFrom("organizationMembers")
        .selectAll()
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .executeTakeFirst();
    },

    /** Adds or updates a member's role; idempotent on the (org, user) primary key. */
    async addMember(orgId: string, userId: string, role: OrganizationRole): Promise<void> {
      await db
        .insertInto("organizationMembers")
        .values({ orgId, userId, role })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doUpdateSet({ role }))
        .execute();
    },

    /** Updates an existing member's role. No-op if the member does not exist. */
    async updateMemberRole(orgId: string, userId: string, role: OrganizationRole): Promise<void> {
      await db
        .updateTable("organizationMembers")
        .set({ role })
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .execute();
    },

    /** Removes a member from the organization. */
    async removeMember(orgId: string, userId: string): Promise<void> {
      await db
        .deleteFrom("organizationMembers")
        .where("orgId", "=", orgId)
        .where("userId", "=", userId)
        .execute();
    },

    /**
     * Acquires a row-level write lock on the organization (`SELECT … FOR UPDATE`).
     * Call this inside a transaction before a count-then-mutate guard (e.g. the
     * last-owner check) so concurrent member mutations on the same org serialize
     * instead of racing the read. A no-op outside a transaction.
     */
    async lockForUpdate(orgId: string): Promise<void> {
      await db
        .selectFrom("organizations")
        .select("id")
        .where("id", "=", orgId)
        .forUpdate()
        .execute();
    },

    /** @returns The count of `owner`-role members (used to keep at least one owner). */
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
