import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createQueryClient } from "./query-client";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("createQueryClient mutation onError", () => {
  function getOnError() {
    const onError = createQueryClient().getDefaultOptions().mutations?.onError;
    if (!onError) {
      throw new Error("expected a default mutation onError");
    }
    return onError as (err: unknown, ...rest: unknown[]) => void;
  }

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("toasts the server message and logs the diagnostic for an ApiError-shaped object", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A PLAIN object with no prototype — what an ApiError becomes after it
    // crosses the server-function (seroval) boundary. instanceof would fail here.
    const serialized = {
      name: "ApiError",
      message: "Collection not found",
      code: "NOT_FOUND",
      diagnostic: "DELETE /api/v1/collections/1 → 404 Not Found\nCollection not found",
    };

    getOnError()(serialized, undefined, undefined);

    expect(toast.error).toHaveBeenCalledWith("Collection not found");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Collection not found"),
      serialized,
    );
    errorSpy.mockRestore();
  });

  it("toasts a non-ApiError error's message and logs the error itself", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("network down");

    getOnError()(err, undefined, undefined);

    expect(toast.error).toHaveBeenCalledWith("network down");
    expect(errorSpy).toHaveBeenCalledWith(err);
    errorSpy.mockRestore();
  });
});
