import { describe, expect, it } from "vitest";

import {
  SLOW_DEVICE_MAX_FRAME_RATE,
  isOverconstrainedError,
  scannerVideoConstraints,
} from "./camera-constraints";

describe("scannerVideoConstraints", () => {
  it("caps the frame rate on a slow device", () => {
    expect(scannerVideoConstraints(true).frameRate).toEqual({
      max: SLOW_DEVICE_MAX_FRAME_RATE,
    });
  });

  it("leaves the frame rate unconstrained on a fast device", () => {
    // Absent, not set to some high number: a device that keeps up has no
    // throttling problem, and a ceiling would only make the preview choppier.
    expect(scannerVideoConstraints(false)).not.toHaveProperty("frameRate");
  });

  it("requests the back camera and 1080p either way", () => {
    for (const slowDevice of [true, false]) {
      const constraints = scannerVideoConstraints(slowDevice);
      expect(constraints.facingMode).toEqual({ ideal: "environment" });
      expect(constraints.width).toEqual({ ideal: 1920 });
      expect(constraints.height).toEqual({ ideal: 1080 });
    }
  });

  it("caps at 30, the rate every camera supports", () => {
    expect(SLOW_DEVICE_MAX_FRAME_RATE).toBe(30);
  });
});

describe("isOverconstrainedError", () => {
  it("recognizes OverconstrainedError", () => {
    expect(isOverconstrainedError(new DOMException("", "OverconstrainedError"))).toBe(true);
  });

  it("recognizes the legacy ConstraintNotSatisfiedError name", () => {
    expect(isOverconstrainedError(new DOMException("", "ConstraintNotSatisfiedError"))).toBe(true);
  });

  it("rejects failures that a retry could not fix", () => {
    expect(isOverconstrainedError(new DOMException("", "NotAllowedError"))).toBe(false);
    expect(isOverconstrainedError(new DOMException("", "NotFoundError"))).toBe(false);
    expect(isOverconstrainedError(new DOMException("", "NotReadableError"))).toBe(false);
  });

  it("rejects a non-Error throw", () => {
    expect(isOverconstrainedError("boom")).toBe(false);
    expect(isOverconstrainedError(undefined)).toBe(false);
    expect(isOverconstrainedError(null)).toBe(false);
  });
});
