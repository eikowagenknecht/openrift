import { describe, expect, it } from "vitest";

import { splitSourcePlayerKey } from "./ingest-meta-overlays.js";

/** The separator the composite key joins on, which no external id can contain. */
const NUL = "\u0000";

describe("splitSourcePlayerKey", () => {
  it("splits a pushed row's key back into the two ids it was built from", () => {
    expect(splitSourcePlayerKey(`evt-1${NUL}p1`)).toEqual({
      eventExternalId: "evt-1",
      playerExternalId: "p1",
    });
  });

  it("keeps a separator inside the player id, splitting only on the first one", () => {
    expect(splitSourcePlayerKey(`evt-1${NUL}p${NUL}1`)).toEqual({
      eventExternalId: "evt-1",
      playerExternalId: `p${NUL}1`,
    });
  });

  it("reads an empty half rather than dropping the key", () => {
    expect(splitSourcePlayerKey(`${NUL}p1`)).toEqual({
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

  it("answers with neither id for a key carrying no separator at all", () => {
    expect(splitSourcePlayerKey("evt-1")).toEqual({
      eventExternalId: null,
      playerExternalId: null,
    });
  });
});
