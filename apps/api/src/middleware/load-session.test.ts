import { describe, expect, it, vi } from "vitest";

import { loadSession, resolveSession } from "./load-session.js";

function createMockContext(session: { user: { id: string }; session: { id: string } } | null) {
  const getSession = vi.fn(() => Promise.resolve(session));
  const vars: Record<string, unknown> = {
    auth: { api: { getSession } },
  };
  return {
    ctx: {
      get: (key: string) => vars[key],
      set: (key: string, value: unknown) => {
        vars[key] = value;
      },
      req: { raw: { headers: new Headers() } },
    } as any,
    getSession,
    vars,
  };
}

describe("resolveSession", () => {
  it("populates context with user + session when signed in", async () => {
    const { ctx } = createMockContext({ user: { id: "u-1" }, session: { id: "s-1" } });

    await resolveSession(ctx);

    expect(ctx.get("user")).toEqual({ id: "u-1" });
    expect(ctx.get("session")).toEqual({ id: "s-1" });
  });

  it("sets user and session to null when signed out", async () => {
    const { ctx } = createMockContext(null);

    await resolveSession(ctx);

    expect(ctx.get("user")).toBeNull();
    expect(ctx.get("session")).toBeNull();
  });

  it("is idempotent: skips getSession when user is already populated", async () => {
    const { ctx, getSession } = createMockContext({
      user: { id: "u-1" },
      session: { id: "s-1" },
    });
    ctx.set("user", { id: "preset-user" });
    ctx.set("session", { id: "preset-session" });

    await resolveSession(ctx);

    expect(getSession).not.toHaveBeenCalled();
    expect(ctx.get("user")).toEqual({ id: "preset-user" });
  });
});

describe("loadSession middleware", () => {
  it("resolves the session before calling next()", async () => {
    const { ctx } = createMockContext({ user: { id: "u-2" }, session: { id: "s-2" } });
    const next = vi.fn(() => Promise.resolve());

    await loadSession(ctx, next);

    expect(ctx.get("user")).toEqual({ id: "u-2" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
