import { describe, expect, test } from "vitest";

import { dropExpiredSessionEvents } from "./sentry-server-filter";

describe("dropExpiredSessionEvents", () => {
  const event = { event_id: "e1" };

  test("drops a 401 ApiError (expired session via raw fetch)", () => {
    const exception = Object.assign(new Error("Unauthorized"), {
      name: "ApiError",
      status: 401,
    });
    expect(dropExpiredSessionEvents(event, { originalException: exception })).toBeNull();
  });

  test("drops a 401 ORPCError (expired session via migrated endpoints)", () => {
    // Regression for Sentry issue OPENRIFT-SSR-1K's "Error: Unauthorized"
    // events: ORPCError keeps `name: "Error"`, so the old name-based ApiError
    // check let it through even though it is the same expected lifecycle state.
    const exception = Object.assign(new Error("Unauthorized"), {
      code: "UNAUTHORIZED",
      status: 401,
      defined: true,
    });
    expect(dropExpiredSessionEvents(event, { originalException: exception })).toBeNull();
  });

  test("keeps a 403", () => {
    const exception = Object.assign(new Error("Forbidden"), { status: 403 });
    expect(dropExpiredSessionEvents(event, { originalException: exception })).toBe(event);
  });

  test("keeps a plain error without status", () => {
    expect(dropExpiredSessionEvents(event, { originalException: new Error("boom") })).toBe(event);
  });

  test("keeps events with no original exception", () => {
    expect(dropExpiredSessionEvents(event, {})).toBe(event);
  });

  test("keeps events with no hint at all", () => {
    expect(dropExpiredSessionEvents(event)).toBe(event);
  });
});
