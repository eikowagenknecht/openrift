import { describe, expect, it } from "vitest";

import { playerSourceKey, splitSourcePlayerKey } from "./ingest-meta-overlays.js";

describe("splitSourcePlayerKey", () => {
  it("splits a pushed row's key back into the two ids it was built from", () => {
    expect(splitSourcePlayerKey(playerSourceKey("evt-1", "p1"))).toEqual({
      eventExternalId: "evt-1",
      playerExternalId: "p1",
    });
  });

  it("recovers ids that hold the characters a separator would have claimed", () => {
    expect(splitSourcePlayerKey(playerSourceKey("evt:1", "12:p1"))).toEqual({
      eventExternalId: "evt:1",
      playerExternalId: "12:p1",
    });
  });

  it("reads an empty half rather than dropping the key", () => {
    expect(splitSourcePlayerKey(playerSourceKey("", "p1"))).toEqual({
      eventExternalId: "",
      playerExternalId: "p1",
    });
  });

  it("answers with neither id for a row no provider keyed", () => {
    expect(splitSourcePlayerKey(null)).toEqual({
      eventExternalId: null,
      playerExternalId: null,
    });
  });

  it("answers with neither id for a key carrying no length prefix at all", () => {
    expect(splitSourcePlayerKey("evt-1")).toEqual({
      eventExternalId: null,
      playerExternalId: null,
    });
  });

  it("answers with neither id for a length prefix reaching past the key", () => {
    expect(splitSourcePlayerKey("99:evt-1p1")).toEqual({
      eventExternalId: null,
      playerExternalId: null,
    });
  });
});
