import { describe, expect, test } from "vitest";

import { tagProcedure } from "./orpc-procedure-tag";
import { dropExpectedClientErrors, fingerprintApiFaults } from "./sentry-server-filter";

describe("dropExpectedClientErrors", () => {
  const event = { event_id: "e1" };

  test("drops a 401 ApiError (expired session via raw fetch)", () => {
    const exception = Object.assign(new Error("Unauthorized"), {
      name: "ApiError",
      status: 401,
    });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBeNull();
  });

  test("drops a 401 ORPCError (expired session via migrated endpoints)", () => {
    // Regression for the reported "Error: Unauthorized" events: ORPCError
    // keeps `name: "Error"`, so the old name-based ApiError
    // check let it through even though it is the same expected lifecycle state.
    const exception = Object.assign(new Error("Unauthorized"), {
      code: "UNAUTHORIZED",
      status: 401,
      defined: true,
    });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBeNull();
  });

  test("drops a 404 ORPCError (the bulk of the reported noise)", () => {
    // Regression: 646 of 828 reported events were "Tournament not found"
    // rethrown by the oRPC client inside a server function. The message is
    // human text, so `ignoreErrors: ["NOT_FOUND"]` never matched it.
    const exception = Object.assign(new Error("Tournament not found"), {
      code: "NOT_FOUND",
      status: 404,
      defined: true,
    });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBeNull();
  });

  test("drops a 403 (an authorization outcome the API decided deliberately)", () => {
    const exception = Object.assign(new Error("Host or staff only"), { status: 403 });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBeNull();
  });

  test("keeps a 500 (the API's own output-validation failures surface here)", () => {
    const exception = Object.assign(new Error("Output validation failed"), {
      code: "INTERNAL_SERVER_ERROR",
      status: 500,
    });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBe(event);
  });

  test("keeps a non-numeric status", () => {
    const exception = Object.assign(new Error("weird"), { status: "404" });
    expect(dropExpectedClientErrors(event, { originalException: exception })).toBe(event);
  });

  test("keeps a plain error without status", () => {
    expect(dropExpectedClientErrors(event, { originalException: new Error("boom") })).toBe(event);
  });

  test("keeps events with no original exception", () => {
    expect(dropExpectedClientErrors(event, {})).toBe(event);
  });

  test("keeps events with no hint at all", () => {
    expect(dropExpectedClientErrors(event)).toBe(event);
  });
});

describe("fingerprintApiFaults", () => {
  const event: { event_id: string; fingerprint?: string[] } = { event_id: "e1" };

  function faultFrom(path: string[], code: string) {
    const error = Object.assign(new Error("Internal server error"), { code, status: 500 });
    tagProcedure(error, path);
    return error;
  }

  test("splits two endpoints answering the same internal error", () => {
    const events = ["events", "decks"].map(
      (procedure) =>
        fingerprintApiFaults(event, {
          originalException: faultFrom([procedure], "INTERNAL_SERVER_ERROR"),
        }).fingerprint,
    );

    expect(events[0]).toEqual(["api-fault", "events", "INTERNAL_SERVER_ERROR"]);
    expect(events[1]).toEqual(["api-fault", "decks", "INTERNAL_SERVER_ERROR"]);
  });

  test("splits two codes from the same endpoint", () => {
    const timeout = fingerprintApiFaults(event, {
      originalException: faultFrom(["meta", "events"], "TIMEOUT"),
    });

    expect(timeout.fingerprint).toEqual(["api-fault", "meta.events", "TIMEOUT"]);
  });

  test("falls back when the error carries no code", () => {
    const error = new Error("Internal server error");
    tagProcedure(error, ["events"]);

    expect(fingerprintApiFaults(event, { originalException: error }).fingerprint).toEqual([
      "api-fault",
      "events",
      "UNKNOWN",
    ]);
  });

  test("leaves an untagged error to Sentry's own grouping", () => {
    expect(fingerprintApiFaults(event, { originalException: new Error("boom") })).toBe(event);
  });

  test("leaves an event that already carries a fingerprint alone", () => {
    const fingerprinted = { event_id: "e1", fingerprint: ["bare-throw", "/cards"] };

    expect(
      fingerprintApiFaults(fingerprinted, {
        originalException: faultFrom(["events"], "INTERNAL_SERVER_ERROR"),
      }),
    ).toBe(fingerprinted);
  });

  test("leaves events with no hint at all", () => {
    expect(fingerprintApiFaults(event)).toBe(event);
  });
});
