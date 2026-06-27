import { describe, expect, it } from "vitest";

import { APP_ENVS, parseAppEnv } from "./app-env.js";

describe("parseAppEnv", () => {
  it("passes through each known environment unchanged", () => {
    for (const env of APP_ENVS) {
      expect(parseAppEnv(env)).toBe(env);
    }
  });

  it("defaults undefined to development", () => {
    expect(parseAppEnv(undefined)).toBe("development");
  });

  it("defaults the empty string to development", () => {
    expect(parseAppEnv("")).toBe("development");
  });

  it("defaults unknown values to development", () => {
    expect(parseAppEnv("staging")).toBe("development");
    expect(parseAppEnv("PRODUCTION")).toBe("development");
    expect(parseAppEnv("prod")).toBe("development");
  });
});
