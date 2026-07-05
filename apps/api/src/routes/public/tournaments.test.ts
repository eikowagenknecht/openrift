import { describe, expect, it } from "vitest";

import { participantDisplayName } from "./tournaments.js";

describe("participantDisplayName", () => {
  it("uses the account name when present", () => {
    expect(participantDisplayName("Rift Walker", "someone@example.com")).toBe("Rift Walker");
  });

  it("never exposes the raw email: falls back to the local part", () => {
    expect(participantDisplayName(null, "someone@example.com")).toBe("someone");
    expect(participantDisplayName(undefined, "someone@example.com")).toBe("someone");
  });

  it("treats a blank name as missing", () => {
    expect(participantDisplayName("   ", "someone@example.com")).toBe("someone");
    expect(participantDisplayName("", "someone@example.com")).toBe("someone");
  });

  it("falls back to a generic name for a degenerate email", () => {
    expect(participantDisplayName(null, "@example.com")).toBe("Player");
  });
});
