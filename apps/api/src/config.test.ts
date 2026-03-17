import { describe, expect, it } from "vitest";

import { createConfig, validateConfig } from "./config.js";

describe("createConfig", () => {
  it("returns defaults when env vars are missing", () => {
    const config = createConfig({});
    expect(typeof config.port).toBe("number");
    expect(typeof config.databaseUrl).toBe("string");
    expect(typeof config.auth.secret).toBe("string");
  });

  it("builds discord provider config when env vars are present", () => {
    const config = createConfig({
      DISCORD_CLIENT_ID: "discord-id",
      DISCORD_CLIENT_SECRET: "discord-secret",
    });
    expect(config.auth.discord).toEqual({
      clientId: "discord-id",
      clientSecret: "discord-secret",
    });
  });

  it("leaves discord undefined when only one env var is present", () => {
    const config = createConfig({ DISCORD_CLIENT_ID: "discord-id" });
    expect(config.auth.discord).toBeUndefined();
  });
});

describe("validateConfig", () => {
  it("throws when DATABASE_URL is missing", () => {
    expect(() => validateConfig({ BETTER_AUTH_SECRET: "s" })).toThrow(
      "Missing required environment variables: DATABASE_URL",
    );
  });

  it("throws when BETTER_AUTH_SECRET is missing", () => {
    expect(() => validateConfig({ DATABASE_URL: "postgres://x" })).toThrow(
      "Missing required environment variables: BETTER_AUTH_SECRET",
    );
  });

  it("throws listing all missing vars when none are present", () => {
    expect(() => validateConfig({})).toThrow(
      "Missing required environment variables: DATABASE_URL, BETTER_AUTH_SECRET",
    );
  });

  it("does not throw when all required vars are present", () => {
    expect(() =>
      validateConfig({ DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "s" }),
    ).not.toThrow();
  });
});
