import { afterEach, describe, expect, it, vi } from "vitest";

import { captureHandledError } from "./report-error";

const captureException = vi.fn();

vi.mock("./env", () => ({ PROD: true }));
vi.mock("@sentry/tanstackstart-react", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

afterEach(() => {
  captureException.mockReset();
});

describe("captureHandledError", () => {
  it("forwards the error and its tags to Sentry", async () => {
    const error = new Error("boom");

    captureHandledError(error, { mutation: "true" });
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));

    expect(captureException).toHaveBeenCalledWith(error, { tags: { mutation: "true" } });
  });

  it("does not reject when the SDK import or the capture throws", async () => {
    captureException.mockImplementation(() => {
      throw new Error("chunk load failed");
    });

    expect(() => captureHandledError(new Error("boom"), {})).not.toThrow();
    await vi.waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
  });
});
