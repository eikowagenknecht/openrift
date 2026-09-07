import { describe, expect, it } from "vitest";

import { resolveReplaceTarget } from "./deck-import-replace";

const LOCAL_ID = "local:123e4567-e89b-42d3-a456-426614174000";
const SERVER_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("resolveReplaceTarget", () => {
  it("returns none without a replace id", () => {
    expect(resolveReplaceTarget(undefined, true, () => true)).toEqual({ mode: "none" });
  });

  it("targets a local deck even with a session (regression: went to the server and 404ed)", () => {
    expect(resolveReplaceTarget(LOCAL_ID, true, () => true)).toEqual({
      mode: "local",
      deckId: LOCAL_ID,
    });
  });

  it("targets a local deck without a session (regression: silently created a new deck)", () => {
    expect(resolveReplaceTarget(LOCAL_ID, false, () => true)).toEqual({
      mode: "local",
      deckId: LOCAL_ID,
    });
  });

  it("degrades a stale local id to plain import", () => {
    expect(resolveReplaceTarget(LOCAL_ID, true, () => false)).toEqual({ mode: "none" });
  });

  it("targets a server deck only with a session", () => {
    expect(resolveReplaceTarget(SERVER_ID, true, () => true)).toEqual({
      mode: "server",
      deckId: SERVER_ID,
    });
    expect(resolveReplaceTarget(SERVER_ID, false, () => true)).toEqual({ mode: "none" });
  });
});
