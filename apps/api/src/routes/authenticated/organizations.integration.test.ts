import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminReq, createTestContext, req, seedTestUser } from "../../test/integration-context.js";

// Route-level integration tests for the ADR-033 organization surfaces: admin
// provisioning (under /api/admin/v1, requireAdmin-gated) and authenticated
// member management (owner/manager rules, last-owner guard).

// Random per-file users (seeded via seedTestUser in beforeAll) so this file
// cannot collide with pre-seeded registry users or other files' fixtures.
const ADMIN_ID = crypto.randomUUID();
const OWNER_ID = crypto.randomUUID();
const MANAGER_ID = crypto.randomUUID();
const OUTSIDER_ID = crypto.randomUUID();
const EXTRA_ID = crypto.randomUUID();

const adminCtx = createTestContext(ADMIN_ID, `test-${ADMIN_ID}@test.com`);
const ownerCtx = createTestContext(OWNER_ID, `test-${OWNER_ID}@test.com`);
const managerCtx = createTestContext(MANAGER_ID, `test-${MANAGER_ID}@test.com`);
const outsiderCtx = createTestContext(OUTSIDER_ID, `test-${OUTSIDER_ID}@test.com`);
const extraCtx = createTestContext(EXTRA_ID, `test-${EXTRA_ID}@test.com`);

const ALL_IDS = [ADMIN_ID, OWNER_ID, MANAGER_ID, OUTSIDER_ID, EXTRA_ID];

// Mirrors the seed email assigned in beforeAll; members are added by email.
const emailFor = (userId: string) => `test-${userId}@test.com`;

describe.skipIf(!adminCtx || !ownerCtx || !managerCtx || !outsiderCtx || !extraCtx)(
  "Organization routes (integration)",
  () => {
    const admin = adminCtx!;
    const owner = ownerCtx!;
    const manager = managerCtx!;
    const outsider = outsiderCtx!;
    const extra = extraCtx!;
    let orgId = "";

    beforeAll(async () => {
      await seedTestUser(admin.db, { id: ADMIN_ID, isAdmin: true });
      await seedTestUser(admin.db, { id: OWNER_ID });
      await seedTestUser(admin.db, { id: MANAGER_ID });
      await seedTestUser(admin.db, { id: OUTSIDER_ID });
      await seedTestUser(admin.db, { id: EXTRA_ID });
    });

    afterAll(async () => {
      await admin.db.deleteFrom("organizations").where("ownerUserId", "in", ALL_IDS).execute();
      await admin.db.deleteFrom("admins").where("userId", "=", ADMIN_ID).execute();
      await admin.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
    });

    it("rejects org creation by a non-admin", async () => {
      const res = await owner.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-x",
          name: "Store X",
          ownerUserId: OWNER_ID,
        }),
      );
      expect(res.status).toBe(403);
    });

    it("creates an org with an owner membership (admin)", async () => {
      const res = await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-one",
          name: "Store One",
          ownerUserId: OWNER_ID,
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; slug: string };
      orgId = body.id;
      expect(body.slug).toBe("store-one");
    });

    it("rejects a duplicate slug and an invalid slug and a missing owner", async () => {
      const dup = await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-one",
          name: "Dup",
          ownerUserId: OWNER_ID,
        }),
      );
      expect(dup.status).toBe(409);

      const bad = await admin.app.fetch(
        adminReq("POST", "/organizations", { slug: "A", name: "Bad", ownerUserId: OWNER_ID }),
      );
      expect(bad.status).toBeGreaterThanOrEqual(400);
      expect(bad.status).toBeLessThan(500);

      const noOwner = await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-two",
          name: "Store Two",
          ownerUserId: "01900000-0000-7000-8000-000000000000",
        }),
      );
      expect(noOwner.status).toBe(404);
    });

    it("lists orgs with owner name + member count (admin)", async () => {
      const res = await admin.app.fetch(adminReq("GET", "/organizations"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string; memberCount: number }[] };
      const found = body.items.find((item) => item.id === orgId);
      expect(found?.memberCount).toBe(1);
    });

    it("updates and rejects a conflicting slug (admin)", async () => {
      await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-three",
          name: "Store Three",
          ownerUserId: OWNER_ID,
        }),
      );
      const ok = await admin.app.fetch(
        adminReq("PATCH", `/organizations/${orgId}`, { name: "Store One Renamed" }),
      );
      expect(ok.status).toBe(200);
      const clash = await admin.app.fetch(
        adminReq("PATCH", `/organizations/${orgId}`, { slug: "store-three" }),
      );
      expect(clash.status).toBe(409);
    });

    it("returns detail to a member and 404 to an outsider", async () => {
      const detail = await owner.app.fetch(req("GET", `/organizations/${orgId}`));
      expect(detail.status).toBe(200);
      const body = (await detail.json()) as { viewerRole: string; members: unknown[] };
      expect(body.viewerRole).toBe("owner");
      expect(body.members.length).toBe(1);

      const hidden = await outsider.app.fetch(req("GET", `/organizations/${orgId}`));
      expect(hidden.status).toBe(404);
    });

    it("lets the owner add a manager and enforces owner-only owner grants", async () => {
      const add = await owner.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: emailFor(MANAGER_ID),
          role: "manager",
        }),
      );
      expect(add.status).toBe(200);

      // A manager cannot grant the owner role.
      const denied = await manager.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: emailFor(EXTRA_ID),
          role: "owner",
        }),
      );
      expect(denied.status).toBe(403);

      // A manager may add another manager.
      const managerAdds = await manager.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: emailFor(EXTRA_ID),
          role: "manager",
        }),
      );
      expect(managerAdds.status).toBe(200);

      // Re-adding an existing member is a conflict.
      const dup = await owner.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: emailFor(MANAGER_ID),
          role: "manager",
        }),
      );
      expect(dup.status).toBe(409);

      // An unknown email resolves to no account.
      const unknown = await owner.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: "nobody@test.com",
          role: "manager",
        }),
      );
      expect(unknown.status).toBe(404);
    });

    it("lets an owner change a member's role and guards the last owner", async () => {
      // A manager cannot grant or revoke the owner role.
      const denied = await manager.app.fetch(
        req("PATCH", `/organizations/${orgId}/members/${EXTRA_ID}`, { role: "owner" }),
      );
      expect(denied.status).toBe(403);

      // An owner promotes a manager to owner.
      const promote = await owner.app.fetch(
        req("PATCH", `/organizations/${orgId}/members/${EXTRA_ID}`, { role: "owner" }),
      );
      expect(promote.status).toBe(200);
      const promoted = (await promote.json()) as { members: { userId: string; role: string }[] };
      expect(promoted.members.find((member) => member.userId === EXTRA_ID)?.role).toBe("owner");

      // With two owners, demoting one back to manager is allowed.
      const demote = await owner.app.fetch(
        req("PATCH", `/organizations/${orgId}/members/${EXTRA_ID}`, { role: "manager" }),
      );
      expect(demote.status).toBe(200);

      // The last remaining owner cannot be demoted.
      const lastOwner = await owner.app.fetch(
        req("PATCH", `/organizations/${orgId}/members/${OWNER_ID}`, { role: "manager" }),
      );
      expect(lastOwner.status).toBe(400);
    });

    it("makes an org judge a member that cannot manage members", async () => {
      // Owner sets EXTRA to the judge role.
      const setJudge = await owner.app.fetch(
        req("PATCH", `/organizations/${orgId}/members/${EXTRA_ID}`, { role: "judge" }),
      );
      expect(setJudge.status).toBe(200);
      const body = (await setJudge.json()) as { members: { userId: string; role: string }[] };
      expect(body.members.find((member) => member.userId === EXTRA_ID)?.role).toBe("judge");

      // A judge is a member but has no org-admin authority.
      const denied = await extra.app.fetch(
        req("POST", `/organizations/${orgId}/members`, {
          email: emailFor(OUTSIDER_ID),
          role: "judge",
        }),
      );
      expect(denied.status).toBe(403);
    });

    it("guards the last owner on removal", async () => {
      const lastOwner = await owner.app.fetch(
        req("DELETE", `/organizations/${orgId}/members/${OWNER_ID}`),
      );
      expect(lastOwner.status).toBe(400);

      const removeManager = await owner.app.fetch(
        req("DELETE", `/organizations/${orgId}/members/${MANAGER_ID}`),
      );
      expect(removeManager.status).toBe(200);
    });

    it("keeps an owner when two concurrent owner demotions race (TOCTOU guard)", async () => {
      // A fresh org so the race is isolated from the shared fixture's role state.
      const create = await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-race",
          name: "Race",
          ownerUserId: OWNER_ID,
        }),
      );
      const raceOrgId = ((await create.json()) as { id: string }).id;

      // Promote EXTRA to a second owner so the org has exactly two owners.
      await owner.app.fetch(
        req("POST", `/organizations/${raceOrgId}/members`, {
          email: emailFor(EXTRA_ID),
          role: "manager",
        }),
      );
      const promote = await owner.app.fetch(
        req("PATCH", `/organizations/${raceOrgId}/members/${EXTRA_ID}`, { role: "owner" }),
      );
      expect(promote.status).toBe(200);

      // Two co-owners demote each other at the same instant. The last-owner guard
      // must serialize them: exactly one demotion wins, the org keeps one owner.
      const [first, second] = await Promise.all([
        owner.app.fetch(
          req("PATCH", `/organizations/${raceOrgId}/members/${EXTRA_ID}`, { role: "manager" }),
        ),
        extra.app.fetch(
          req("PATCH", `/organizations/${raceOrgId}/members/${OWNER_ID}`, { role: "manager" }),
        ),
      ]);
      const successes = [first, second].filter((res) => res.status === 200).length;
      expect(successes).toBe(1);

      const owners = await admin.db
        .selectFrom("organizationMembers")
        .select((eb) => eb.fn.countAll<number>().as("c"))
        .where("orgId", "=", raceOrgId)
        .where("role", "=", "owner")
        .executeTakeFirst();
      expect(Number(owners?.c ?? 0)).toBe(1);
    });

    it("lists the orgs the caller owns or manages", async () => {
      const res = await owner.app.fetch(req("GET", "/organizations"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string }[] };
      expect(body.items.some((item) => item.id === orgId)).toBe(true);
    });

    it("deletes an org (admin)", async () => {
      const create = await admin.app.fetch(
        adminReq("POST", "/organizations", {
          slug: "store-temp",
          name: "Temp",
          ownerUserId: OWNER_ID,
        }),
      );
      const tempId = ((await create.json()) as { id: string }).id;
      const del = await admin.app.fetch(adminReq("DELETE", `/organizations/${tempId}`));
      expect(del.status).toBe(204);
      const missing = await admin.app.fetch(adminReq("DELETE", `/organizations/${tempId}`));
      expect(missing.status).toBe(404);
    });
  },
);
