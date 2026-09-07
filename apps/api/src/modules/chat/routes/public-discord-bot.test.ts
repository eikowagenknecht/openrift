import { ERROR_CODES } from "@openrift/shared/error-codes";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { discordBotRouter } from "./public-discord-bot";

const mockLinksRepo = {
  redeemCode: vi.fn(),
  findByGuildId: vi.fn(),
};

const mockMatchesRepo = {
  tradelistHoldersForCard: vi.fn(),
};

const SECRET = "test-bot-secret";

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("repos", {
    friendGroupDiscordLinks: mockLinksRepo,
    friendGroupMatches: mockMatchesRepo,
  } as never);
  c.set("config", { discordBotApiSecret: SECRET } as never);
  await next();
});
registerRouterForTest(app, discordBotRouter);

const appWithoutSecret = new Hono<{ Variables: Variables }>();
appWithoutSecret.use("*", async (c, next) => {
  c.set("repos", {
    friendGroupDiscordLinks: mockLinksRepo,
    friendGroupMatches: mockMatchesRepo,
  } as never);
  c.set("config", { discordBotApiSecret: null } as never);
  await next();
});
registerRouterForTest(appWithoutSecret, discordBotRouter);

const CARD_ID = "a0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "a0000000-0002-4000-a000-000000000001";
const ALT_PRINTING_ID = "a0000000-0002-4000-a000-000000000002";

function redeem(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/v1/discord-bot/links", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function holders(headers: Record<string, string> = {}) {
  return app.request(`/api/v1/discord-bot/guilds/guild-1/cards/${CARD_ID}/tradelist-holders`, {
    headers,
  });
}

const AUTH = { Authorization: `Bearer ${SECRET}` };

describe("discord-bot router auth", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("401s without an Authorization header", async () => {
    const response = await holders();
    expect(response.status).toBe(401);
    expect(await readJson(response)).toMatchObject({ code: ERROR_CODES.UNAUTHORIZED });
  });

  it("401s with a wrong secret", async () => {
    const response = await holders({ Authorization: "Bearer nope" });
    expect(response.status).toBe(401);
  });

  it("401s when no secret is configured, even with a matching header", async () => {
    const response = await appWithoutSecret.request(
      `/api/v1/discord-bot/guilds/guild-1/cards/${CARD_ID}/tradelist-holders`,
      { headers: AUTH },
    );
    expect(response.status).toBe(401);
  });
});

describe("POST /api/v1/discord-bot/links", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redeems a code and returns the linked group", async () => {
    mockLinksRepo.redeemCode.mockResolvedValue({ status: "linked", link: { id: "l1" } });
    mockLinksRepo.findByGuildId.mockResolvedValue({
      groupId: "g1",
      groupSlug: "summoners",
      groupName: "Summoner Skirmish",
    });
    const response = await redeem(
      { code: "abc123", guildId: "guild-1", guildName: "Our TCG" },
      AUTH,
    );
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      groupSlug: "summoners",
      groupName: "Summoner Skirmish",
    });
    expect(mockLinksRepo.redeemCode).toHaveBeenCalledWith({
      code: "abc123",
      guildId: "guild-1",
      guildName: "Our TCG",
    });
  });

  it("404s on an unknown or expired code", async () => {
    mockLinksRepo.redeemCode.mockResolvedValue({ status: "unknown-code" });
    const response = await redeem({ code: "stale", guildId: "guild-1" }, AUTH);
    expect(response.status).toBe(404);
    expect(await readJson(response)).toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });

  it("409s when the guild is linked to another group", async () => {
    mockLinksRepo.redeemCode.mockResolvedValue({ status: "guild-taken" });
    const response = await redeem({ code: "abc123", guildId: "guild-1" }, AUTH);
    expect(response.status).toBe(409);
    expect(await readJson(response)).toMatchObject({ code: ERROR_CODES.CONFLICT });
  });

  it("stores a blank guild name as null", async () => {
    mockLinksRepo.redeemCode.mockResolvedValue({ status: "linked", link: { id: "l1" } });
    mockLinksRepo.findByGuildId.mockResolvedValue({
      groupId: "g1",
      groupSlug: "s",
      groupName: "G",
    });
    await redeem({ code: "abc123", guildId: "guild-1", guildName: "   " }, AUTH);
    expect(mockLinksRepo.redeemCode).toHaveBeenCalledWith(
      expect.objectContaining({ guildName: null }),
    );
  });
});

describe("GET /api/v1/discord-bot/guilds/{guildId}/cards/{cardId}/tradelist-holders", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns linked: false for an unlinked guild without touching the matcher", async () => {
    mockLinksRepo.findByGuildId.mockResolvedValue(undefined);
    const response = await holders(AUTH);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ linked: false, groupName: null, holders: [] });
    expect(mockMatchesRepo.tradelistHoldersForCard).not.toHaveBeenCalled();
  });

  it("projects holders down to name, quantity and printings (no user ids)", async () => {
    mockLinksRepo.findByGuildId.mockResolvedValue({
      groupId: "g1",
      groupSlug: "summoners",
      groupName: "Summoner Skirmish",
    });
    mockMatchesRepo.tradelistHoldersForCard.mockResolvedValue([
      {
        userId: "u1",
        userName: "Alice",
        quantity: 2,
        printings: [
          { printingId: PRINTING_ID, quantity: 1, listNames: ["Binder"] },
          { printingId: ALT_PRINTING_ID, quantity: 1, listNames: ["Trades"] },
        ],
      },
      {
        userId: "u2",
        userName: null,
        quantity: 1,
        printings: [{ printingId: PRINTING_ID, quantity: 1, listNames: ["Binder"] }],
      },
    ]);
    const response = await holders(AUTH);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      linked: true,
      groupName: "Summoner Skirmish",
      holders: [
        {
          userName: "Alice",
          quantity: 2,
          printings: [
            { printingId: PRINTING_ID, quantity: 1, listNames: ["Binder"] },
            { printingId: ALT_PRINTING_ID, quantity: 1, listNames: ["Trades"] },
          ],
        },
        {
          userName: null,
          quantity: 1,
          printings: [{ printingId: PRINTING_ID, quantity: 1, listNames: ["Binder"] }],
        },
      ],
    });
    expect(mockMatchesRepo.tradelistHoldersForCard).toHaveBeenCalledWith({
      groupId: "g1",
      cardId: CARD_ID,
    });
  });
});
