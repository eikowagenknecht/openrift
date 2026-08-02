import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestContext, req } from "../../test/integration-context.js";

// Route-level integration tests for the ADR-033 unified tournaments umbrella:
// create (with CHECK-invariant 422s + host authorization), list/detail/settings/
// cancel/delete, staff grants (by candidate id, with eligibility + invite links),
// and the participant roster (walk-in, approve/deny, drop, unlink, remove guard).

const HOST_ID = crypto.randomUUID();
const OTHER_ID = crypto.randomUUID();
const JUDGE_ID = crypto.randomUUID();
const LINK_ID = crypto.randomUUID();
const ORG_ID = crypto.randomUUID();
const ORG2_ID = crypto.randomUUID();

const hostCtx = createTestContext(HOST_ID, `test-${HOST_ID}@test.com`);
const otherCtx = createTestContext(OTHER_ID, `test-${OTHER_ID}@test.com`);
const judgeCtx = createTestContext(JUDGE_ID, `test-${JUDGE_ID}@test.com`);

const ALL_IDS = [HOST_ID, OTHER_ID, JUDGE_ID, LINK_ID];

interface Participant {
  id: string;
  displayName: string;
  status: string;
  userId: string | null;
}

describe.skipIf(!hostCtx || !otherCtx || !judgeCtx)(
  "Tournament umbrella routes (integration)",
  () => {
    const host = hostCtx!;
    const other = otherCtx!;
    const judge = judgeCtx!;
    let id = "";

    // Fetches the roster and returns the participant matching a display name.
    async function findParticipant(displayName: string): Promise<Participant | undefined> {
      const res = await host.app.fetch(req("GET", `/tournaments/${id}/participants`));
      const body = (await res.json()) as { items: Participant[] };
      return body.items.find((item) => item.displayName === displayName);
    }

    beforeAll(async () => {
      for (const userId of ALL_IDS) {
        await host.db
          .insertInto("users")
          .values({
            id: userId,
            email: `test-${userId}@test.com`,
            name: "T",
            emailVerified: true,
            image: null,
          })
          .execute();
      }
      // An org hosted by OTHER (OTHER is the only member) for the host-authz test.
      await host.db
        .insertInto("organizations")
        .values({ id: ORG_ID, slug: "trn-org", name: "Trn Org", ownerUserId: OTHER_ID })
        .execute();
      await host.db
        .insertInto("organizationMembers")
        .values({ orgId: ORG_ID, userId: OTHER_ID, role: "owner" })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doNothing())
        .execute();
      // A second org owned by HOST, the reassignment target HOST may host into.
      await host.db
        .insertInto("organizations")
        .values({ id: ORG2_ID, slug: "trn-org2", name: "Trn Org 2", ownerUserId: HOST_ID })
        .execute();
      await host.db
        .insertInto("organizationMembers")
        .values({ orgId: ORG2_ID, userId: HOST_ID, role: "owner" })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doNothing())
        .execute();
    });

    afterAll(async () => {
      await host.db.deleteFrom("tournaments").where("hostUserId", "in", ALL_IDS).execute();
      await host.db.deleteFrom("tournaments").where("hostOrgId", "in", [ORG_ID, ORG2_ID]).execute();
      await host.db.deleteFrom("organizations").where("id", "in", [ORG_ID, ORG2_ID]).execute();
      await host.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
    });

    it("allows an empty tournament (no pairings, no decks) on create", async () => {
      // Since the format collapse, a roster/schedule-only event is valid: no
      // pairing engine and no decklist is no longer a CHECK violation.
      const empty = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Just a meetup",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(empty.status).toBe(201);
    });

    it("rejects an out-of-order schedule with 422 on create", async () => {
      // endsAt cannot precede startsAt.
      const badEnd = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Backwards",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
          endsAt: "2026-05-30T12:00:00Z",
        }),
      );
      expect(badEnd.status).toBe(422);

      // Submissions cannot close after the tournament ends.
      const badClose = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Late Close",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
          endsAt: "2026-06-01T20:00:00Z",
          submissionsCloseAt: "2026-06-02T12:00:00Z",
        }),
      );
      expect(badClose.status).toBe(422);
    });

    it("creates a user-hosted pod tournament and seeds organizer staff", async () => {
      const res = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Friday Pods",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        pairingStyle: string;
        modules: { pairing: boolean };
        myRoles: string[];
        host: { type: string; displayName: string };
      };
      id = body.id;
      expect(body.pairingStyle).toBe("pod");
      expect(body.modules.pairing).toBe(true);
      expect(body.myRoles).toContain("host");
      expect(body.myRoles).toContain("organizer");
      expect(body.host.type).toBe("user");

      const staff = await host.app.fetch(req("GET", `/tournaments/${id}/staff`));
      const staffBody = (await staff.json()) as { items: { userId: string; role: string }[] };
      expect(staffBody.items.some((s) => s.userId === HOST_ID && s.role === "organizer")).toBe(
        true,
      );
    });

    it("enforces org-host authorization", async () => {
      // HOST is not a member of ORG → 403.
      const denied = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Org Event",
          host: { type: "organization", orgId: ORG_ID },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(denied.status).toBe(403);

      // OTHER owns ORG → 201.
      const ok = await other.app.fetch(
        req("POST", "/tournaments", {
          name: "Org Event",
          host: { type: "organization", orgId: ORG_ID },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(ok.status).toBe(201);
      const body = (await ok.json()) as { host: { type: string; orgSlug: string } };
      expect(body.host.type).toBe("organization");
      expect(body.host.orgSlug).toBe("trn-org");
    });

    it("returns detail to the host and 404 to an unrelated user", async () => {
      const detail = await host.app.fetch(req("GET", `/tournaments/${id}`));
      expect(detail.status).toBe(200);
      const hidden = await other.app.fetch(req("GET", `/tournaments/${id}`));
      expect(hidden.status).toBe(404);
    });

    // Regression: the detail response must never hand the staff-invite tokens to a
    // viewer who is merely a participant (or a `requested` one). Without the gate,
    // anyone who self-registered could harvest `judgeInviteToken`, claim it, and
    // escalate to judge/organizer.
    it("hides staff/share tokens from non-staff viewers in detail", async () => {
      const create = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Token Gate Event",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "optional",
          startsAt: "2026-06-01T12:00:00Z",
          selfRegistration: true,
        }),
      );
      const gateId = ((await create.json()) as { id: string }).id;

      // Pin all four tokens to known values regardless of which endpoint mints each.
      await host.db
        .updateTable("tournaments")
        .set({
          submissionToken: "gate-submission",
          reportToken: "gate-report",
          organizerInviteToken: "gate-organizer-invite",
          judgeInviteToken: "gate-judge-invite",
        })
        .where("id", "=", gateId)
        .execute();

      interface DetailTokens {
        myRoles: string[];
        submissionToken: string | null;
        reportToken: string | null;
        organizerInviteToken: string | null;
        judgeInviteToken: string | null;
        staff: { userId: string | null }[];
      }

      // OTHER self-registers via the public token → a `requested` participant that
      // passes `hasRelationship` and can read the detail.
      const join = await other.app.fetch(
        req("POST", "/tournaments/submit/gate-submission/request"),
      );
      expect(join.status).toBe(200);

      const asParticipant = await other.app.fetch(req("GET", `/tournaments/${gateId}`));
      expect(asParticipant.status).toBe(200);
      const participantBody = (await asParticipant.json()) as DetailTokens;
      expect(participantBody.myRoles).toContain("participant");
      expect(participantBody.myRoles).not.toContain("organizer");
      expect(participantBody.myRoles).not.toContain("judge");
      // Every token field is withheld from a plain participant.
      expect(participantBody.organizerInviteToken).toBeNull();
      expect(participantBody.judgeInviteToken).toBeNull();
      expect(participantBody.submissionToken).toBeNull();
      expect(participantBody.reportToken).toBeNull();
      // The staff roster is manage-gated, so a participant gets an empty list
      // rather than the organizers' identities (matches the `listStaff` route).
      expect(participantBody.staff).toEqual([]);

      // A judge sees the operational share links but never the staff-invite tokens
      // (a judge must not be able to mint more staff).
      await host.app.fetch(
        req("POST", `/tournaments/${gateId}/participants`, { displayName: "J" }),
      );
      await host.db
        .insertInto("tournamentStaff")
        .values({ tournamentId: gateId, userId: JUDGE_ID, role: "judge" })
        .onConflict((oc) => oc.columns(["tournamentId", "userId", "role"]).doNothing())
        .execute();
      const asJudge = await judge.app.fetch(req("GET", `/tournaments/${gateId}`));
      const judgeBody = (await asJudge.json()) as DetailTokens;
      expect(judgeBody.myRoles).toContain("judge");
      expect(judgeBody.submissionToken).toBe("gate-submission");
      expect(judgeBody.reportToken).toBe("gate-report");
      expect(judgeBody.organizerInviteToken).toBeNull();
      expect(judgeBody.judgeInviteToken).toBeNull();
      // The roster stays organizer-gated even for a judge (mirrors `listStaff`).
      expect(judgeBody.staff).toEqual([]);

      // The host (organizer) sees every token.
      const asHost = await host.app.fetch(req("GET", `/tournaments/${gateId}`));
      const hostBody = (await asHost.json()) as DetailTokens;
      expect(hostBody.organizerInviteToken).toBe("gate-organizer-invite");
      expect(hostBody.judgeInviteToken).toBe("gate-judge-invite");
      expect(hostBody.submissionToken).toBe("gate-submission");
      expect(hostBody.reportToken).toBe("gate-report");
      // And the host (organizer) sees the populated roster.
      expect(hostBody.staff.some((member) => member.userId === HOST_ID)).toBe(true);
    });

    it("lists my tournaments", async () => {
      const res = await host.app.fetch(req("GET", "/tournaments"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string }[] };
      expect(body.items.some((item) => item.id === id)).toBe(true);
    });

    it("orders the list by tournament date, most recent first (not creation order)", async () => {
      // Create the earlier-dated tournament second so creation order is the
      // reverse of the expected (tournament-date) order.
      const later = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Sort Later",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2027-01-01T12:00:00Z",
        }),
      );
      const earlier = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Sort Earlier",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-01-01T12:00:00Z",
        }),
      );
      const laterId = ((await later.json()) as { id: string }).id;
      const earlierId = ((await earlier.json()) as { id: string }).id;

      const res = await host.app.fetch(req("GET", "/tournaments"));
      const body = (await res.json()) as { items: { id: string }[] };
      const laterIndex = body.items.findIndex((item) => item.id === laterId);
      const earlierIndex = body.items.findIndex((item) => item.id === earlierId);
      expect(laterIndex).toBeGreaterThanOrEqual(0);
      expect(earlierIndex).toBeGreaterThanOrEqual(0);
      // Later startsAt sorts ahead of earlier startsAt, regardless of creation order.
      expect(laterIndex).toBeLessThan(earlierIndex);
    });

    it("updates settings and re-validates the invariants", async () => {
      const ok = await host.app.fetch(
        req("PATCH", `/tournaments/${id}`, { name: "Friday Night Pods", byePoints: 2 }),
      );
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { name: string; byePoints: number };
      expect(body.name).toBe("Friday Night Pods");
      expect(body.byePoints).toBe(2);
    });

    // Regression: leaving the pod engine must revoke both follow-along tokens.
    // Otherwise a now-meaningless link keeps resolving and renders a pod shell for
    // a tournament that no longer has pairings or standings.
    it("revokes the report and follow tokens when the pairing engine leaves pod", async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Engine Switch Event",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const switchId = ((await created.json()) as { id: string }).id;

      const enabled = await host.app.fetch(req("POST", `/tournaments/${switchId}/report-token`));
      const enabledBody = (await enabled.json()) as { reportToken: string | null };
      expect(enabledBody.reportToken).not.toBeNull();

      const followEnabled = await host.app.fetch(
        req("POST", `/tournaments/${switchId}/follow-token`),
      );
      const followEnabledBody = (await followEnabled.json()) as { followToken: string | null };
      expect(followEnabledBody.followToken).not.toBeNull();

      // Switching to no-pairings (allowed because no round exists yet) clears both.
      const switched = await host.app.fetch(
        req("PATCH", `/tournaments/${switchId}`, { pairingStyle: "none" }),
      );
      expect(switched.status).toBe(200);
      const switchedBody = (await switched.json()) as {
        reportToken: string | null;
        followToken: string | null;
      };
      expect(switchedBody.reportToken).toBeNull();
      expect(switchedBody.followToken).toBeNull();
    });

    // The read-only follow token is independently enable/disable-able and is
    // gated to staff in the detail payload (mirrors the report token's gating).
    it("enables and disables the read-only follow token", async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Follow Link Event",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const followId = ((await created.json()) as { id: string }).id;

      const enabled = await host.app.fetch(req("POST", `/tournaments/${followId}/follow-token`));
      const enabledBody = (await enabled.json()) as { followToken: string | null };
      expect(enabledBody.followToken).not.toBeNull();

      const disabled = await host.app.fetch(req("DELETE", `/tournaments/${followId}/follow-token`));
      expect(disabled.status).toBe(200);
      const disabledBody = (await disabled.json()) as { followToken: string | null };
      expect(disabledBody.followToken).toBeNull();
    });

    it("reassigns the host in any direction, host-only and gated on target membership", async () => {
      // A fresh personal tournament owned by HOST, so the shared `id` is untouched.
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Reassign Me",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(created.status).toBe(201);
      const reassignId = ((await created.json()) as { id: string }).id;

      // A non-host (unrelated user) cannot reassign — the manage gate rejects first.
      const byStranger = await other.app.fetch(
        req("PATCH", `/tournaments/${reassignId}`, {
          host: { type: "organization", orgId: ORG2_ID },
        }),
      );
      expect(byStranger.status).toBe(403);

      // HOST cannot hand it to an org they don't belong to.
      const toForeignOrg = await host.app.fetch(
        req("PATCH", `/tournaments/${reassignId}`, {
          host: { type: "organization", orgId: ORG_ID },
        }),
      );
      expect(toForeignOrg.status).toBe(403);

      // personal → an org HOST owns.
      const toOrg = await host.app.fetch(
        req("PATCH", `/tournaments/${reassignId}`, {
          host: { type: "organization", orgId: ORG2_ID },
        }),
      );
      expect(toOrg.status).toBe(200);
      const toOrgBody = (await toOrg.json()) as { host: { type: string; orgId: string } };
      expect(toOrgBody.host.type).toBe("organization");
      expect(toOrgBody.host.orgId).toBe(ORG2_ID);

      // org → personal binds the host back to the caller.
      const toPersonal = await host.app.fetch(
        req("PATCH", `/tournaments/${reassignId}`, { host: { type: "user" } }),
      );
      expect(toPersonal.status).toBe(200);
      const toPersonalBody = (await toPersonal.json()) as {
        host: { type: string; userId: string };
        myRoles: string[];
      };
      expect(toPersonalBody.host.type).toBe("user");
      expect(toPersonalBody.host.userId).toBe(HOST_ID);
      expect(toPersonalBody.myRoles).toContain("host");
    });

    it("surfaces org owners/managers as implicit staff, deduped against grants", async () => {
      // OTHER becomes a manager of ORG2 (HOST already owns it).
      await host.db
        .insertInto("organizationMembers")
        .values({ orgId: ORG2_ID, userId: OTHER_ID, role: "manager" })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doUpdateSet({ role: "manager" }))
        .execute();

      // An org-hosted tournament. HOST is seeded as an explicit organizer on create.
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Org Staffed",
          host: { type: "organization", orgId: ORG2_ID },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      expect(created.status).toBe(201);
      const orgTid = ((await created.json()) as { id: string }).id;

      // A judge with no org membership, added explicitly. They must be an
      // eligible candidate (a linked participant here), so seed that first.
      await host.db
        .insertInto("tournamentParticipants")
        .values({ tournamentId: orgTid, userId: JUDGE_ID, displayName: "Judge", status: "active" })
        .execute();
      const addJudge = await host.app.fetch(
        req("POST", `/tournaments/${orgTid}/staff`, { userId: JUDGE_ID, role: "judge" }),
      );
      expect(addJudge.status).toBe(200);

      interface StaffMember {
        userId: string;
        role: string;
        source: string;
        orgRole: string | null;
      }
      const staff = await host.app.fetch(req("GET", `/tournaments/${orgTid}/staff`));
      const items = ((await staff.json()) as { items: StaffMember[] }).items;

      // HOST is an org owner AND a seeded grant → shown once, from the org.
      const hostRows = items.filter((member) => member.userId === HOST_ID);
      expect(hostRows).toHaveLength(1);
      expect(hostRows[0]).toMatchObject({
        role: "organizer",
        source: "organization",
        orgRole: "owner",
      });

      const otherRow = items.find((member) => member.userId === OTHER_ID);
      expect(otherRow).toMatchObject({
        role: "organizer",
        source: "organization",
        orgRole: "manager",
      });

      const judgeRow = items.find((member) => member.userId === JUDGE_ID);
      expect(judgeRow).toMatchObject({ role: "judge", source: "grant", orgRole: null });
    });

    it("treats an org judge as a judge only — no manage, no host", async () => {
      // JUDGE becomes a judge member of ORG2 (HOST owns it).
      await host.db
        .insertInto("organizationMembers")
        .values({ orgId: ORG2_ID, userId: JUDGE_ID, role: "judge" })
        .onConflict((oc) => oc.columns(["orgId", "userId"]).doUpdateSet({ role: "judge" }))
        .execute();

      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Org Judge Event",
          host: { type: "organization", orgId: ORG2_ID },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-02T12:00:00Z",
        }),
      );
      expect(created.status).toBe(201);
      const orgTid = ((await created.json()) as { id: string }).id;

      // The judge sees a judge role, not host/organizer.
      const detail = await judge.app.fetch(req("GET", `/tournaments/${orgTid}`));
      expect(detail.status).toBe(200);
      const myRoles = ((await detail.json()) as { myRoles: string[] }).myRoles;
      expect(myRoles).toContain("judge");
      expect(myRoles).not.toContain("host");
      expect(myRoles).not.toContain("organizer");

      // The implicit staff row reflects the org judge.
      interface StaffRow {
        userId: string;
        role: string;
        source: string;
        orgRole: string | null;
      }
      const staff = await host.app.fetch(req("GET", `/tournaments/${orgTid}/staff`));
      const judgeRow = ((await staff.json()) as { items: StaffRow[] }).items.find(
        (member) => member.userId === JUDGE_ID,
      );
      expect(judgeRow).toMatchObject({ role: "judge", source: "organization", orgRole: "judge" });

      // The judge cannot manage the tournament.
      const manage = await judge.app.fetch(
        req("PATCH", `/tournaments/${orgTid}`, { name: "Renamed by judge" }),
      );
      expect(manage.status).toBe(403);

      // The judge cannot host a new tournament under the org.
      const hostAttempt = await judge.app.fetch(
        req("POST", "/tournaments", {
          name: "Judge Hosted",
          host: { type: "organization", orgId: ORG2_ID },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-03T12:00:00Z",
        }),
      );
      expect(hostAttempt.status).toBe(403);
    });

    it("manages staff (host only, added by candidate id)", async () => {
      // JUDGE is eligible because they are a linked participant of this event.
      await host.db
        .insertInto("tournamentParticipants")
        .values({ tournamentId: id, userId: JUDGE_ID, displayName: "Judge", status: "active" })
        .execute();

      const denied = await other.app.fetch(
        req("POST", `/tournaments/${id}/staff`, { userId: JUDGE_ID, role: "judge" }),
      );
      expect(denied.status).toBe(403);

      const add = await host.app.fetch(
        req("POST", `/tournaments/${id}/staff`, { userId: JUDGE_ID, role: "judge" }),
      );
      expect(add.status).toBe(200);

      // A user with no relationship to the event is not a candidate (no email,
      // no enumeration) and is rejected even for the host.
      const stranger = await host.app.fetch(
        req("POST", `/tournaments/${id}/staff`, { userId: LINK_ID, role: "judge" }),
      );
      expect(stranger.status).toBe(403);

      const remove = await host.app.fetch(
        req("DELETE", `/tournaments/${id}/staff/${JUDGE_ID}/judge`),
      );
      expect(remove.status).toBe(200);
      const body = (await remove.json()) as { items: { userId: string }[] };
      expect(body.items.some((s) => s.userId === JUDGE_ID)).toBe(false);
    });

    it("lists eligible staff candidates and excludes existing staff", async () => {
      // OTHER is a linked participant → a candidate. HOST is already organizer
      // staff (seeded on create) → excluded.
      await host.db
        .insertInto("tournamentParticipants")
        .values({ tournamentId: id, userId: OTHER_ID, displayName: "Other", status: "active" })
        // uq_tournament_participants_user is a partial index (WHERE user_id IS NOT
        // NULL), so the conflict target must carry the same predicate to be inferred.
        .onConflict((oc) =>
          oc.columns(["tournamentId", "userId"]).where("userId", "is not", null).doNothing(),
        )
        .execute();

      const res = await host.app.fetch(req("GET", `/tournaments/${id}/staff/candidates`));
      expect(res.status).toBe(200);
      const items = ((await res.json()) as { items: { userId: string; source: string }[] }).items;
      expect(items.some((candidate) => candidate.userId === OTHER_ID)).toBe(true);
      expect(items.some((candidate) => candidate.userId === HOST_ID)).toBe(false);

      // Non-managers cannot read the candidate list.
      const denied = await other.app.fetch(req("GET", `/tournaments/${id}/staff/candidates`));
      expect(denied.status).toBe(403);
    });

    it("creates, rotates, and revokes a staff invite link", async () => {
      const enable = await host.app.fetch(
        req("POST", `/tournaments/${id}/staff-invite`, { role: "judge" }),
      );
      expect(enable.status).toBe(200);
      const first = (await enable.json()) as { judgeInviteToken: string | null };
      expect(first.judgeInviteToken).toBeTruthy();

      // Rotating mints a fresh token and retires the old one.
      const rotate = await host.app.fetch(
        req("POST", `/tournaments/${id}/staff-invite`, { role: "judge" }),
      );
      const second = (await rotate.json()) as { judgeInviteToken: string | null };
      expect(second.judgeInviteToken).toBeTruthy();
      expect(second.judgeInviteToken).not.toBe(first.judgeInviteToken);

      // A non-manager cannot mint links.
      const denied = await other.app.fetch(
        req("POST", `/tournaments/${id}/staff-invite`, { role: "judge" }),
      );
      expect(denied.status).toBe(403);

      const disable = await host.app.fetch(req("DELETE", `/tournaments/${id}/staff-invite/judge`));
      expect(disable.status).toBe(200);
      const cleared = (await disable.json()) as { judgeInviteToken: string | null };
      expect(cleared.judgeInviteToken).toBeNull();
    });

    it("adds walk-ins and updates participants", async () => {
      const walkIn = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants`, { displayName: "Alice" }),
      );
      expect(walkIn.status).toBe(200);
      const alice = await findParticipant("Alice");
      expect(alice?.status).toBe("active");

      const update = await host.app.fetch(
        req("PATCH", `/tournaments/${id}/participants/${alice!.id}`, { seed: 1 }),
      );
      expect(update.status).toBe(200);
    });

    it("refuses walk-ins on a completed or cancelled tournament", async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Closed Event",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const closedId = ((await created.json()) as { id: string }).id;

      // A running tournament still takes late walk-ins.
      await host.db
        .updateTable("tournaments")
        .set({ status: "running" })
        .where("id", "=", closedId)
        .execute();
      const running = await host.app.fetch(
        req("POST", `/tournaments/${closedId}/participants`, { displayName: "LateBird" }),
      );
      expect(running.status).toBe(200);

      // Once completed, walk-ins are refused with a 409.
      await host.db
        .updateTable("tournaments")
        .set({ status: "completed" })
        .where("id", "=", closedId)
        .execute();
      const onCompleted = await host.app.fetch(
        req("POST", `/tournaments/${closedId}/participants`, { displayName: "TooLate" }),
      );
      expect(onCompleted.status).toBe(409);

      // Same for a cancelled tournament.
      await host.db
        .updateTable("tournaments")
        .set({ status: "cancelled" })
        .where("id", "=", closedId)
        .execute();
      const onCancelled = await host.app.fetch(
        req("POST", `/tournaments/${closedId}/participants`, { displayName: "TooLate2" }),
      );
      expect(onCancelled.status).toBe(409);
    });

    it("drops and reactivates a participant", async () => {
      const alice = await findParticipant("Alice");
      const drop = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${alice!.id}/drop`),
      );
      expect(drop.status).toBe(200);
      const dropped = await findParticipant("Alice");
      expect(dropped?.status).toBe("dropped");

      const react = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${alice!.id}/reactivate`),
      );
      expect(react.status).toBe(200);
      const reactivated = await findParticipant("Alice");
      expect(reactivated?.status).toBe("active");
    });

    it("approves and denies pending requests", async () => {
      await host.db
        .insertInto("tournamentParticipants")
        .values({
          tournamentId: id,
          displayName: "ReqApprove",
          status: "requested" as unknown as "active",
        })
        .execute();
      await host.db
        .insertInto("tournamentParticipants")
        .values({
          tournamentId: id,
          displayName: "ReqDeny",
          status: "requested" as unknown as "active",
        })
        .execute();

      const toApprove = await findParticipant("ReqApprove");
      const approve = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${toApprove!.id}/approve`),
      );
      expect(approve.status).toBe(200);
      const approved = await findParticipant("ReqApprove");
      expect(approved?.status).toBe("active");

      const toDeny = await findParticipant("ReqDeny");
      const deny = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${toDeny!.id}/deny`),
      );
      expect(deny.status).toBe(200);
      expect(await findParticipant("ReqDeny")).toBeUndefined();

      // Approving a non-pending participant is a conflict.
      const alice = await findParticipant("Alice");
      const conflict = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${alice!.id}/approve`),
      );
      expect(conflict.status).toBe(409);
    });

    it("unlinks an account from a participant", async () => {
      await host.app.fetch(
        req("POST", `/tournaments/${id}/participants`, { displayName: "LinkA" }),
      );
      const linkA = await findParticipant("LinkA");
      // Linking only happens via the player's own claim; seed a linked entry directly.
      await host.db
        .updateTable("tournamentParticipants")
        .set({ userId: LINK_ID, claimSource: "claim_link", claimedAt: new Date() })
        .where("id", "=", linkA!.id)
        .execute();

      const unlink = await host.app.fetch(
        req("POST", `/tournaments/${id}/participants/${linkA!.id}/unlink`),
      );
      expect(unlink.status).toBe(200);
      const unlinked = await findParticipant("LinkA");
      expect(unlinked?.userId).toBeNull();
    });

    it("re-issues a claim link after an unlink, unblocking the spot", async () => {
      // A fresh tournament so the unlink -> reissue -> claim cycle is isolated.
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Reissue Claim",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const reissueTid = ((await created.json()) as { id: string }).id;
      await host.app.fetch(
        req("POST", `/tournaments/${reissueTid}/participants`, { displayName: "Wrongly Linked" }),
      );
      const findHere = async (): Promise<{
        id: string;
        claimToken: string | null;
        claimBlocked: boolean;
      }> => {
        const list = await host.app.fetch(req("GET", `/tournaments/${reissueTid}/participants`));
        const items = (
          (await list.json()) as {
            items: {
              displayName: string;
              id: string;
              claimToken: string | null;
              claimBlocked: boolean;
            }[];
          }
        ).items;
        return items.find((participant) => participant.displayName === "Wrongly Linked")!;
      };

      // Seed a (wrong) account link, then unlink it the way a judge would.
      const seeded = await findHere();
      await host.db
        .updateTable("tournamentParticipants")
        .set({ userId: LINK_ID, claimSource: "claim_link", claimedAt: new Date() })
        .where("id", "=", seeded.id)
        .execute();
      const unlink = await host.app.fetch(
        req("POST", `/tournaments/${reissueTid}/participants/${seeded.id}/unlink`),
      );
      expect(unlink.status).toBe(200);

      // Unlink leaves the spot blocked: the dead token is withheld and the
      // claim flow would refuse it — the dead-end the re-issue exists to undo.
      const blocked = await findHere();
      expect(blocked.claimBlocked).toBe(true);
      expect(blocked.claimToken).toBeNull();

      // Re-issue clears the block and rotates the token.
      const reissue = await host.app.fetch(
        req("POST", `/tournaments/${reissueTid}/participants/${seeded.id}/reissue-claim`),
      );
      expect(reissue.status).toBe(200);
      const reopened = await findHere();
      expect(reopened.claimBlocked).toBe(false);
      expect(reopened.claimToken).toBeTruthy();

      // The correct player can now claim the spot through the fresh link.
      const claim = await other.app.fetch(req("POST", `/deck-check/claim/${reopened.claimToken}`));
      expect(claim.status).toBe(200);
      expect(((await claim.json()) as { status: string }).status).toBe("claimed");
    });

    it("claims a participant by its link in a tournament without deck check", async () => {
      // A fresh user-hosted tournament with no deck check at all.
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Claim No Deck Check",
          host: { type: "user" },
          pairingStyle: "pod",
          deckSubmission: "none",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const claimTournamentId = ((await created.json()) as { id: string }).id;
      await host.app.fetch(
        req("POST", `/tournaments/${claimTournamentId}/participants`, { displayName: "Claimable" }),
      );
      const list = await host.app.fetch(
        req("GET", `/tournaments/${claimTournamentId}/participants`),
      );
      const items = (
        (await list.json()) as { items: { displayName: string; claimToken: string | null }[] }
      ).items;
      const claimable = items.find((participant) => participant.displayName === "Claimable");
      // Every participant gets a claim token, with or without deck check.
      expect(claimable?.claimToken).toBeTruthy();

      // A different account claims the spot through its link.
      const claim = await other.app.fetch(
        req("POST", `/deck-check/claim/${claimable?.claimToken}`),
      );
      expect(claim.status).toBe(200);
      const result = (await claim.json()) as {
        status: string;
        tournamentId: string | null;
        entryId: string | null;
      };
      expect(result.status).toBe("claimed");
      expect(result.tournamentId).toBe(claimTournamentId);
      // No deck check, so there is no deck entry to route to.
      expect(result.entryId).toBeNull();
    });

    it("guards removal of a participant seated in a pod", async () => {
      await host.app.fetch(
        req("POST", `/tournaments/${id}/participants`, { displayName: "Seated" }),
      );
      const seated = await findParticipant("Seated");

      const round = await host.db
        .insertInto("podRounds")
        .values({ tournamentId: id, roundNumber: 1, penaltyTotal: 0, pairingStrategy: "manual" })
        .returning("id")
        .executeTakeFirstOrThrow();
      const pod = await host.db
        .insertInto("pods")
        .values({ roundId: round.id, podNumber: 1, size: 3, penaltyBreakdown: JSON.stringify({}) })
        .returning("id")
        .executeTakeFirstOrThrow();
      await host.db
        .insertInto("podMembers")
        .values({ podId: pod.id, playerId: seated!.id, placement: null })
        .execute();

      const guarded = await host.app.fetch(
        req("DELETE", `/tournaments/${id}/participants/${seated!.id}`),
      );
      expect(guarded.status).toBe(409);

      // A participant with no pod membership removes cleanly.
      await host.app.fetch(req("POST", `/tournaments/${id}/participants`, { displayName: "Free" }));
      const free = await findParticipant("Free");
      const removed = await host.app.fetch(
        req("DELETE", `/tournaments/${id}/participants/${free!.id}`),
      );
      expect(removed.status).toBe(200);
    });

    it("enforces the forward-only status lifecycle on update", async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Lifecycle",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const lifecycleId = ((await created.json()) as { id: string }).id;

      // setup → running is allowed.
      const run = await host.app.fetch(
        req("PATCH", `/tournaments/${lifecycleId}`, { status: "running" }),
      );
      expect(run.status).toBe(200);
      expect(((await run.json()) as { status: string }).status).toBe("running");

      // running → setup is a backwards move and is rejected.
      const back = await host.app.fetch(
        req("PATCH", `/tournaments/${lifecycleId}`, { status: "setup" }),
      );
      expect(back.status).toBe(409);

      // running → completed is allowed; completed → running is then rejected.
      const done = await host.app.fetch(
        req("PATCH", `/tournaments/${lifecycleId}`, { status: "completed" }),
      );
      expect(done.status).toBe(200);
      const reopen = await host.app.fetch(
        req("PATCH", `/tournaments/${lifecycleId}`, { status: "running" }),
      );
      expect(reopen.status).toBe(409);

      await host.app.fetch(req("DELETE", `/tournaments/${lifecycleId}`));
    });

    it("rejects an out-of-order schedule on update, merging against the stored row", async () => {
      const created = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Reschedule",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "required",
          startsAt: "2026-06-01T12:00:00Z",
        }),
      );
      const reschedId = ((await created.json()) as { id: string }).id;

      // Patching only endsAt is validated against the unchanged stored startsAt.
      const bad = await host.app.fetch(
        req("PATCH", `/tournaments/${reschedId}`, { endsAt: "2026-05-01T12:00:00Z" }),
      );
      expect(bad.status).toBe(422);

      const good = await host.app.fetch(
        req("PATCH", `/tournaments/${reschedId}`, { endsAt: "2026-06-02T12:00:00Z" }),
      );
      expect(good.status).toBe(200);

      await host.app.fetch(req("DELETE", `/tournaments/${reschedId}`));
    });

    it("cancels and then blocks edits and deletes (host only)", async () => {
      const cancel = await host.app.fetch(req("POST", `/tournaments/${id}/cancel`));
      expect(cancel.status).toBe(200);
      expect(((await cancel.json()) as { status: string }).status).toBe("cancelled");

      const blocked = await host.app.fetch(req("PATCH", `/tournaments/${id}`, { name: "Nope" }));
      expect(blocked.status).toBe(409);

      const notHost = await other.app.fetch(req("DELETE", `/tournaments/${id}`));
      expect(notHost.status).toBe(403);

      const del = await host.app.fetch(req("DELETE", `/tournaments/${id}`));
      expect(del.status).toBe(204);
      id = "";
    });
  },
);
