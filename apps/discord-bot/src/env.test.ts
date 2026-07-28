import { describe, expect, it } from "vitest";

import { readBotEnv } from "./env.js";

describe("readBotEnv", () => {
  it("throws when the bot token is missing", () => {
    expect(() => readBotEnv({})).toThrow("DISCORD_BOT_TOKEN is not set");
    expect(() => readBotEnv({ DISCORD_BOT_TOKEN: "" })).toThrow("DISCORD_BOT_TOKEN is not set");
  });

  it("falls back to localhost URLs when unset", () => {
    const env = readBotEnv({ DISCORD_BOT_TOKEN: "token" });
    expect(env.apiUrl).toBe("http://localhost:3000");
    expect(env.siteUrl).toBe("http://localhost:5173");
  });

  it("reads the configured URLs", () => {
    const env = readBotEnv({
      DISCORD_BOT_TOKEN: "token",
      API_INTERNAL_URL: "http://api:3000",
      SITE_URL: "https://openrift.example",
    });
    expect(env.apiUrl).toBe("http://api:3000");
    expect(env.siteUrl).toBe("https://openrift.example");
  });
});
