import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestContext,
  createUnauthenticatedTestContext,
  req,
} from "../../test/integration-context.js";

// Route-level integration tests for the ADR-033 public request-to-join surface:
// the unauthenticated submission-token landing, the authenticated request-to-join
// that lands a `requested` participant behind the approval gate (respecting the
// one-participant-per-account index), and the staff-invite link whose grant fires
// only on the explicit confirm POST (never the scanner-reachable GET landing).

const HOST_ID = "a0000000-0220-4000-a000-000000000001";
const JOINER_ID = "a0000000-0221-4000-a000-000000000001";

const hostCtx = createTestContext(HOST_ID, "ptrn-host@test.com");
const joinerCtx = createTestContext(JOINER_ID, "ptrn-joiner@test.com");
const anonCtx = createUnauthenticatedTestContext();

const ALL_IDS = [HOST_ID, JOINER_ID];

describe.skipIf(!hostCtx || !joinerCtx || !anonCtx)(
  "Public tournament request-to-join (integration)",
  () => {
    const host = hostCtx!;
    const joiner = joinerCtx!;
    const anon = anonCtx!;
    let id = "";
    let token = "";

    beforeAll(async () => {
      for (const userId of ALL_IDS) {
        await host.db
          .insertInto("users")
          .values({
            id: userId,
            email: `ptrn-${userId.slice(11, 15)}@test.com`,
            name: "T",
            emailVerified: true,
            image: null,
          })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
      }
      const create = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Open Store Event",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "optional",
          startsAt: "2026-06-01T12:00:00Z",
          selfRegistration: true,
        }),
      );
      id = ((await create.json()) as { id: string }).id;
      const enabled = await host.app.fetch(req("POST", `/tournaments/${id}/submission-token`));
      token = ((await enabled.json()) as { submissionToken: string }).submissionToken;
    });

    afterAll(async () => {
      await host.db.deleteFrom("tournaments").where("hostUserId", "in", ALL_IDS).execute();
      await host.db.deleteFrom("users").where("id", "in", ALL_IDS).execute();
    });

    it("serves the landing (no auth) and 404s an unknown token", async () => {
      const res = await anon.app.fetch(req("GET", `/tournaments/submit/${token}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        name: string;
        selfRegistrationOpen: boolean;
        deckExpected: boolean;
        viewerIsParticipant: boolean;
      };
      expect(body.name).toBe("Open Store Event");
      expect(body.selfRegistrationOpen).toBe(true);
      expect(body.deckExpected).toBe(true);
      // Anonymous viewer never holds a spot.
      expect(body.viewerIsParticipant).toBe(false);

      const missing = await anon.app.fetch(req("GET", "/tournaments/submit/nope"));
      expect(missing.status).toBe(404);
    });

    it("requires a session to request to join", async () => {
      const res = await anon.app.fetch(req("POST", `/tournaments/submit/${token}/request`));
      expect(res.status).toBe(401);
    });

    it("creates a requested participant and is idempotent per account", async () => {
      const first = await joiner.app.fetch(req("POST", `/tournaments/submit/${token}/request`));
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as {
        participantId: string;
        status: string;
        alreadyJoined: boolean;
      };
      expect(firstBody.status).toBe("requested");
      expect(firstBody.alreadyJoined).toBe(false);

      const second = await joiner.app.fetch(req("POST", `/tournaments/submit/${token}/request`));
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { participantId: string; alreadyJoined: boolean };
      expect(secondBody.participantId).toBe(firstBody.participantId);
      expect(secondBody.alreadyJoined).toBe(true);
    });

    it("reports the signed-in viewer's participant status on the landing", async () => {
      // The host runs the event but holds no player spot.
      const hostView = await host.app.fetch(req("GET", `/tournaments/submit/${token}`));
      const hostBody = (await hostView.json()) as { viewerIsParticipant: boolean };
      expect(hostBody.viewerIsParticipant).toBe(false);

      // The joiner requested a spot in the previous test, so the landing reflects
      // it. This gates deck submission when self-registration is later closed
      // (ADR-033): a claimed participant can still submit, a stranger cannot.
      const joinerView = await joiner.app.fetch(req("GET", `/tournaments/submit/${token}`));
      const joinerBody = (await joinerView.json()) as { viewerIsParticipant: boolean };
      expect(joinerBody.viewerIsParticipant).toBe(true);
    });

    it("rejects request-to-join once the tournament is completed or cancelled", async () => {
      const create = await host.app.fetch(
        req("POST", "/tournaments", {
          name: "Closed Event",
          host: { type: "user" },
          pairingStyle: "none",
          deckSubmission: "optional",
          startsAt: "2026-06-01T12:00:00Z",
          selfRegistration: true,
        }),
      );
      const closedId = ((await create.json()) as { id: string }).id;
      const enabled = await host.app.fetch(
        req("POST", `/tournaments/${closedId}/submission-token`),
      );
      const closedToken = ((await enabled.json()) as { submissionToken: string }).submissionToken;

      // Self-registration stays open, but completing the tournament closes entries
      // with a terminal-state conflict (409), distinct from the 403 self-reg gate.
      await host.app.fetch(req("PATCH", `/tournaments/${closedId}`, { status: "completed" }));
      const afterComplete = await joiner.app.fetch(
        req("POST", `/tournaments/submit/${closedToken}/request`),
      );
      expect(afterComplete.status).toBe(409);

      // Cancelling is likewise closed to new entrants.
      await host.app.fetch(req("PATCH", `/tournaments/${closedId}`, { status: "cancelled" }));
      const afterCancel = await joiner.app.fetch(
        req("POST", `/tournaments/submit/${closedToken}/request`),
      );
      expect(afterCancel.status).toBe(409);
    });

    it("rejects request-to-join when self-registration is closed", async () => {
      await host.app.fetch(req("PATCH", `/tournaments/${id}`, { selfRegistration: false }));
      const res = await joiner.app.fetch(req("POST", `/tournaments/submit/${token}/request`));
      expect(res.status).toBe(403);
    });

    it("grants staff via the invite link only on the explicit claim", async () => {
      const enabled = await host.app.fetch(
        req("POST", `/tournaments/${id}/staff-invite`, { role: "judge" }),
      );
      const inviteToken = ((await enabled.json()) as { judgeInviteToken: string }).judgeInviteToken;

      // The landing requires a session, so a link scanner gets a 401, not a grant.
      const anonLanding = await anon.app.fetch(
        req("GET", `/tournaments/staff-invite/${inviteToken}`),
      );
      expect(anonLanding.status).toBe(401);

      // Opening the landing (a GET) reveals the role but must NOT grant it.
      const landing = await joiner.app.fetch(
        req("GET", `/tournaments/staff-invite/${inviteToken}`),
      );
      expect(landing.status).toBe(200);
      const landingBody = (await landing.json()) as { role: string; alreadyStaff: boolean };
      expect(landingBody.role).toBe("judge");
      expect(landingBody.alreadyStaff).toBe(false);

      const beforeClaim = await host.app.fetch(req("GET", `/tournaments/${id}/staff`));
      const beforeItems = ((await beforeClaim.json()) as { items: { userId: string }[] }).items;
      expect(beforeItems.some((member) => member.userId === JOINER_ID)).toBe(false);

      // The explicit confirm POST is what grants the role.
      const claim = await joiner.app.fetch(
        req("POST", `/tournaments/staff-invite/${inviteToken}/claim`),
      );
      expect(claim.status).toBe(200);
      expect((await claim.json()) as { role: string }).toMatchObject({ role: "judge" });

      const afterClaim = await host.app.fetch(req("GET", `/tournaments/${id}/staff`));
      const afterItems = (
        (await afterClaim.json()) as {
          items: { userId: string; role: string }[];
        }
      ).items;
      expect(
        afterItems.some((member) => member.userId === JOINER_ID && member.role === "judge"),
      ).toBe(true);

      // Claiming again is idempotent and reports the existing grant.
      const reclaim = await joiner.app.fetch(
        req("POST", `/tournaments/staff-invite/${inviteToken}/claim`),
      );
      expect(reclaim.status).toBe(200);
      expect((await reclaim.json()) as { alreadyStaff: boolean }).toMatchObject({
        alreadyStaff: true,
      });

      const missing = await joiner.app.fetch(req("GET", "/tournaments/staff-invite/nope"));
      expect(missing.status).toBe(404);
    });
  },
);
