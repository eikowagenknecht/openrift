import { describe, expect, it } from "vitest";

import { encoderCreateRetryable, encoderStartErrorMessage } from "./scan-encoder-error";

describe("encoderCreateRetryable", () => {
  it("refuses a retry once the backend has aborted", () => {
    expect(
      encoderCreateRetryable(
        new Error("no available backend found. ERR: [wasm] RuntimeError: Out of memory"),
      ),
    ).toBe(false);
  });

  it("refuses a retry for a string-serialized backend failure", () => {
    expect(encoderCreateRetryable("no available backend found. ERR: [wasm] Error")).toBe(false);
  });

  it("allows a retry for a create failure past backend init", () => {
    expect(encoderCreateRetryable(new Error("Can't create a session."))).toBe(true);
  });

  it("allows a retry for a non-Error throw", () => {
    expect(encoderCreateRetryable(undefined)).toBe(true);
  });
});

describe("encoderStartErrorMessage", () => {
  const fallback = "Could not start the encoder";

  it("maps a backend-init out-of-memory failure to the fresh-tab message", () => {
    const message = encoderStartErrorMessage(
      new Error("no available backend found. ERR: [wasm] RuntimeError: Out of memory"),
      fallback,
    );
    expect(message).toMatch(/ran out of memory/u);
    expect(message).toMatch(/new tab/u);
  });

  it("maps emscripten heap-growth failures to the fresh-tab message", () => {
    expect(encoderStartErrorMessage(new Error("Cannot enlarge memory arrays."), fallback)).toMatch(
      /ran out of memory/u,
    );
    expect(encoderStartErrorMessage(new Error("abort(OOM)"), fallback)).toMatch(
      /ran out of memory/u,
    );
  });

  it("does not treat 'oom' inside a longer word as out of memory", () => {
    expect(encoderStartErrorMessage(new Error("zoom level invalid"), fallback)).toBe(
      "zoom level invalid",
    );
  });

  it("keeps a regular error's own message", () => {
    expect(encoderStartErrorMessage(new Error("model file is corrupt"), fallback)).toBe(
      "model file is corrupt",
    );
  });

  it("falls back for a non-Error throw", () => {
    expect(encoderStartErrorMessage(undefined, fallback)).toBe(fallback);
  });

  it("falls back for an Error with an empty message", () => {
    // oxlint-disable-next-line unicorn/error-message -- the empty message is the case under test
    expect(encoderStartErrorMessage(new Error(""), fallback)).toBe(fallback);
  });
});
