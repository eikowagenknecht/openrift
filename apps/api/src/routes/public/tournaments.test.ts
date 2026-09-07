import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../deps.js";
import { registerRouterForTest } from "../../test/mount-router.js";
import { readJson } from "../../test/read-json.js";
import type { Variables } from "../../types.js";
import { participantDisplayName, publicTournamentsRouter, resolveSelfJoin } from "./tournaments.js";

const USER = { id: "user-1", name: "Ashe", email: "ashe@example.com" };
const TOURNAMENT_ID = "tournament-1";

function reposStub(overrides: {
  findByUser: (...args: unknown[]) => Promise<unknown>;
  createParticipant: (...args: unknown[]) => Promise<unknown>;
}) {
  const findParticipantByUser = vi.fn(overrides.findByUser);
  const createParticipant = vi.fn(overrides.createParticipant);
  const repos = { tournaments: { findParticipantByUser, createParticipant } } as unknown as Repos;
  return { repos, findParticipantByUser, createParticipant };
}

describe("participantDisplayName", () => {
  it("uses the account name when present", () => {
    expect(participantDisplayName("Rift Walker", "someone@example.com")).toBe("Rift Walker");
  });

  it("never exposes the raw email: falls back to the local part", () => {
    expect(participantDisplayName(null, "someone@example.com")).toBe("someone");
    expect(participantDisplayName(undefined, "someone@example.com")).toBe("someone");
  });

  it("treats a blank name as missing", () => {
    expect(participantDisplayName("   ", "someone@example.com")).toBe("someone");
    expect(participantDisplayName("", "someone@example.com")).toBe("someone");
  });

  it("falls back to a generic name for a degenerate email", () => {
    expect(participantDisplayName(null, "@example.com")).toBe("Player");
  });
});

describe("resolveSelfJoin", () => {
  it("returns the existing spot without inserting", async () => {
    const { repos, createParticipant } = reposStub({
      findByUser: async () => ({ id: "p-existing", status: "approved" }),
      createParticipant: async () => ({ id: "p-new", status: "requested" }),
    });
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({
      participantId: "p-existing",
      status: "approved",
      alreadyJoined: true,
    });
    expect(createParticipant).not.toHaveBeenCalled();
  });

  it("creates a requested participant when none exists", async () => {
    const { repos } = reposStub({
      findByUser: async () => undefined,
      createParticipant: async () => ({ id: "p-new", status: "requested" }),
    });
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({ participantId: "p-new", status: "requested", alreadyJoined: false });
  });

  it("resolves to the race winner when the insert hits a unique violation", async () => {
    const findByUser = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "p-race", status: "requested" });
    const repos = {
      tournaments: {
        findParticipantByUser: findByUser,
        createParticipant: vi.fn(async () => {
          throw Object.assign(new Error("duplicate key"), { code: "23505" });
        }),
      },
    } as unknown as Repos;
    const result = await resolveSelfJoin(repos, TOURNAMENT_ID, USER);
    expect(result).toEqual({ participantId: "p-race", status: "requested", alreadyJoined: true });
  });

  it("re-throws a non-unique insert error", async () => {
    const boom = new Error("connection reset");
    const { repos } = reposStub({
      findByUser: async () => undefined,
      createParticipant: async () => {
        throw boom;
      },
    });
    await expect(resolveSelfJoin(repos, TOURNAMENT_ID, USER)).rejects.toBe(boom);
  });
});

const INVITE_TOKEN = "staffinvite01";
const HOST_USER_ID = "host-1";

function makeStaffInviteApp(overrides: {
  user?: { id: string } | null;
  tournaments?: Record<string, unknown>;
}) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", (overrides.user ?? null) as never);
    c.set("repos", {
      tournaments: {
        findByStaffInviteToken: vi.fn(() =>
          Promise.resolve({
            tournament: {
              id: TOURNAMENT_ID,
              name: "Summoner Skirmish",
              hostType: "user",
              hostUserId: HOST_USER_ID,
              hostOrgId: null,
            },
            role: "judge",
          }),
        ),
        getUserNames: vi.fn(() => Promise.resolve(new Map([[HOST_USER_ID, "Rift Warden"]]))),
        isHostOrStaff: vi.fn(() => Promise.resolve(false)),
        ...overrides.tournaments,
      },
    } as never);
    await next();
  });
  registerRouterForTest(app, publicTournamentsRouter);
  return app;
}

describe("staffInviteLanding", () => {
  it("tells a signed-out invitee which event and role the link is for", async () => {
    const app = makeStaffInviteApp({ user: null });
    const res = await app.request(`/api/v1/tournaments/staff-invite/${INVITE_TOKEN}`);
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      name: string;
      hostDisplayName: string;
      role: string;
      alreadyStaff: boolean;
    };
    expect(body.name).toBe("Summoner Skirmish");
    expect(body.hostDisplayName).toBe("Rift Warden");
    expect(body.role).toBe("judge");
    expect(body.alreadyStaff).toBe(false);
  });

  it("never checks staff membership without a session", async () => {
    const isHostOrStaff = vi.fn(() => Promise.resolve(false));
    const app = makeStaffInviteApp({ user: null, tournaments: { isHostOrStaff } });
    await app.request(`/api/v1/tournaments/staff-invite/${INVITE_TOKEN}`);
    expect(isHostOrStaff).not.toHaveBeenCalled();
  });

  it("reports the role a signed-in viewer already holds", async () => {
    const app = makeStaffInviteApp({
      user: { id: "judge-1" },
      tournaments: { isHostOrStaff: vi.fn(() => Promise.resolve(true)) },
    });
    const res = await app.request(`/api/v1/tournaments/staff-invite/${INVITE_TOKEN}`);
    const body = (await readJson(res)) as { alreadyStaff: boolean };
    expect(body.alreadyStaff).toBe(true);
  });

  it("returns 404 for a token that matches nothing", async () => {
    const app = makeStaffInviteApp({
      user: null,
      tournaments: { findByStaffInviteToken: vi.fn(() => Promise.resolve(undefined)) },
    });
    const res = await app.request(`/api/v1/tournaments/staff-invite/${INVITE_TOKEN}`);
    expect(res.status).toBe(404);
  });
});
