import { describe, expect, it } from "vitest";

import { cameraErrorMessage } from "./camera-error";

describe("cameraErrorMessage", () => {
  it("maps NotFoundError to a message about missing cameras", () => {
    // Firefox's exact rejection on a machine where no camera is visible.
    const thrown = new DOMException("The object can not be found here.", "NotFoundError");
    expect(cameraErrorMessage(thrown, "Could not open the camera")).toBe(
      "No camera found. Check that a camera is connected and not disabled in your system's privacy settings.",
    );
  });

  it("maps the legacy DevicesNotFoundError name the same way", () => {
    const thrown = new DOMException("Requested device not found", "DevicesNotFoundError");
    expect(cameraErrorMessage(thrown, "fallback")).toContain("No camera found");
  });

  it("maps NotAllowedError to a message about blocked access", () => {
    const thrown = new DOMException("Permission denied", "NotAllowedError");
    expect(cameraErrorMessage(thrown, "fallback")).toContain("Camera access was blocked");
  });

  it("maps NotReadableError to a message about the camera being in use", () => {
    const thrown = new DOMException("Could not start video source", "NotReadableError");
    expect(cameraErrorMessage(thrown, "fallback")).toContain("in use by another app");
  });

  it("maps OverconstrainedError to a message about unsupported settings", () => {
    const thrown = new DOMException("", "OverconstrainedError");
    expect(cameraErrorMessage(thrown, "fallback")).toContain("requested video settings");
  });

  it("maps SecurityError to a message about the browser setting", () => {
    const thrown = new DOMException("", "SecurityError");
    expect(cameraErrorMessage(thrown, "fallback")).toContain("disabled in this browser");
  });

  it("passes through the message of an unrecognized error", () => {
    const thrown = new Error("something odd happened");
    expect(cameraErrorMessage(thrown, "fallback")).toBe("something odd happened");
  });

  it("uses the fallback for an unrecognized error with an empty message", () => {
    const thrown = new DOMException("", "AbortError");
    expect(cameraErrorMessage(thrown, "fallback")).toBe("fallback");
  });

  it("uses the fallback for a non-Error throw", () => {
    expect(cameraErrorMessage("boom", "fallback")).toBe("fallback");
    expect(cameraErrorMessage(undefined, "fallback")).toBe("fallback");
  });
});
