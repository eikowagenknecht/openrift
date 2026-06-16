import { describe, expect, it } from "vitest";

import { otpErrorMessage, requestOtpErrorMessage } from "./auth-errors";

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

describe("requestOtpErrorMessage", () => {
  it("reports rate limiting on a 429", () => {
    expect(requestOtpErrorMessage({ status: 429 })).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
  });

  it("reports an invalid email", () => {
    expect(requestOtpErrorMessage({ code: "INVALID_EMAIL" })).toBe(
      "Please enter a valid email address.",
    );
  });

  it("prefers the rate-limit message even when a code is present", () => {
    expect(requestOtpErrorMessage({ status: 429, code: "INVALID_EMAIL" })).toBe(
      "Too many requests. Please wait a moment and try again.",
    );
  });

  it("falls back to a generic send failure for anything else", () => {
    expect(requestOtpErrorMessage({})).toBe("We couldn't send a code right now. Please try again.");
    expect(requestOtpErrorMessage({ code: "SOMETHING_ELSE", status: 500 })).toBe(
      "We couldn't send a code right now. Please try again.",
    );
  });
});
