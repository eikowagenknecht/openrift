import { describe, expect, it } from "vitest";

import { tradeBadgeState } from "./trade-row-parts";

describe("tradeBadgeState", () => {
  it("splits a pending trade by whose move it is", () => {
    expect(tradeBadgeState({ status: "pending", awaitingViewer: true })).toBe("your-move");
    expect(tradeBadgeState({ status: "pending", awaitingViewer: false })).toBe("waiting-for-them");
  });

  it("treats an unqualified pending trade as waiting on them", () => {
    expect(tradeBadgeState({ status: "pending" })).toBe("waiting-for-them");
  });

  it("splits a reserved trade by whether the viewer has settled their half", () => {
    expect(tradeBadgeState({ status: "reserved" })).toBe("ready-to-swap");
    expect(tradeBadgeState({ status: "reserved", viewerSettled: true })).toBe("done-your-side");
  });

  it("keeps each terminal status distinct, so no section can suppress them as one", () => {
    expect(tradeBadgeState({ status: "completed" })).toBe("status:completed");
    expect(tradeBadgeState({ status: "declined" })).toBe("status:declined");
    expect(tradeBadgeState({ status: "cancelled" })).toBe("status:cancelled");
    expect(tradeBadgeState({ status: "expired" })).toBe("status:expired");
  });

  it("does not let a settle-awaiting legacy completed row take the ready-to-swap state", () => {
    expect(tradeBadgeState({ status: "completed", viewerSettled: false })).not.toBe(
      "ready-to-swap",
    );
  });
});
