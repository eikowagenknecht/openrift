import { describe, expect, it } from "vitest";

import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token.js";

const SECRET = "test-secret-key";
const USER_ID = "a0000000-0001-4000-a000-000000000001";

describe("unsubscribe-token", () => {
  it("round-trips a token for each channel", () => {
    for (const channel of ["tradeMatches", "tradeRequests"] as const) {
      const token = signUnsubscribeToken(SECRET, USER_ID, channel);
      expect(verifyUnsubscribeToken(SECRET, token)).toEqual({ userId: USER_ID, channel });
    }
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    expect(verifyUnsubscribeToken("other-secret", token)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const [payloadUser, channel] = token.split(".");
    const tampered = `${payloadUser}.${channel}.deadbeef`;
    expect(verifyUnsubscribeToken(SECRET, tampered)).toBeNull();
  });

  it("rejects a token whose channel was swapped (signature no longer matches)", () => {
    const token = signUnsubscribeToken(SECRET, USER_ID, "tradeRequests");
    const [payloadUser, , signature] = token.split(".");
    const swapped = `${payloadUser}.tradeMatches.${signature}`;
    expect(verifyUnsubscribeToken(SECRET, swapped)).toBeNull();
  });

  it("rejects a token naming an unknown channel", () => {
    const forged = `${Buffer.from(USER_ID).toString("base64url")}.somethingElse.sig`;
    expect(verifyUnsubscribeToken(SECRET, forged)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "only-one-part")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "two.parts")).toBeNull();
  });
});
