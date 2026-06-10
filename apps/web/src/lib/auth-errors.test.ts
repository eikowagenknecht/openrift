import { describe, expect, it } from "vitest";

import { otpErrorMessage } from "./auth-errors";

describe("otpErrorMessage", () => {
  it("maps known OTP error codes to their shared message", () => {
    expect(otpErrorMessage({ code: "OTP_EXPIRED" })).toBe(
      "Code expired. Please request a new one.",
    );
    expect(otpErrorMessage({ code: "INVALID_OTP" })).toBe("Incorrect code. Please try again.");
    expect(otpErrorMessage({ code: "TOO_MANY_ATTEMPTS" })).toBe(
      "Too many attempts. Please request a new code.",
    );
  });

  it("falls back to the server message for non-OTP codes", () => {
    expect(otpErrorMessage({ code: "SOMETHING_ELSE", message: "Boom" })).toBe("Boom");
    expect(otpErrorMessage({ message: "Network down" })).toBe("Network down");
  });

  it("falls back to a generic message when nothing is provided", () => {
    expect(otpErrorMessage({})).toBe("Something went wrong. Please try again.");
  });
});
