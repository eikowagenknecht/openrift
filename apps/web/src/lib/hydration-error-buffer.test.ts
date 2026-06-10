import { beforeEach, describe, expect, test, vi } from "vitest";

import type { BufferedHydrationError } from "./hydration-error-buffer";

// The buffer is a module singleton (a queue + a sink). Reset module state
// between tests by re-importing a fresh copy rather than reaching into private
// internals.
let bufferHydrationError: (entry: BufferedHydrationError) => void;
let drainHydrationErrors: (capture: (entry: BufferedHydrationError) => void) => void;

beforeEach(async () => {
  vi.resetModules();
  ({ bufferHydrationError, drainHydrationErrors } = await import("./hydration-error-buffer"));
});

describe("hydration-error-buffer", () => {
  test("flushes errors buffered before the sink is registered, in order", () => {
    const first: BufferedHydrationError = {
      phase: "recoverable",
      duringHydration: true,
      error: new Error("first"),
    };
    const second: BufferedHydrationError = {
      phase: "uncaught",
      duringHydration: true,
      error: new Error("second"),
      componentStack: "\n    in head",
    };
    bufferHydrationError(first);
    bufferHydrationError(second);

    const capture = vi.fn();
    drainHydrationErrors(capture);

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, first);
    expect(capture).toHaveBeenNthCalledWith(2, second);
  });

  test("forwards immediately once the sink is registered, without queuing", () => {
    const capture = vi.fn();
    drainHydrationErrors(capture);
    expect(capture).not.toHaveBeenCalled();

    const entry: BufferedHydrationError = {
      phase: "caught",
      duringHydration: false,
      error: new Error("late"),
    };
    bufferHydrationError(entry);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(entry);
  });

  test("draining an empty buffer never calls the sink", () => {
    const capture = vi.fn();
    drainHydrationErrors(capture);
    expect(capture).not.toHaveBeenCalled();
  });

  test("preserves an absent component stack", () => {
    const entry: BufferedHydrationError = {
      phase: "recoverable",
      duringHydration: true,
      error: "bare throw",
    };
    bufferHydrationError(entry);

    const capture = vi.fn();
    drainHydrationErrors(capture);

    expect(capture).toHaveBeenCalledWith(entry);
    expect(capture.mock.calls[0]?.[0].componentStack).toBeUndefined();
  });

  test("caps the queue so a re-throw loop can't grow it without bound", () => {
    for (let index = 0; index < 60; index += 1) {
      bufferHydrationError({
        phase: "recoverable",
        duringHydration: true,
        error: new Error(`err-${index}`),
      });
    }

    const capture = vi.fn();
    drainHydrationErrors(capture);

    // 50 retained, the last 10 dropped.
    expect(capture).toHaveBeenCalledTimes(50);
    expect(capture.mock.calls[0]?.[0].error).toHaveProperty("message", "err-0");
    expect(capture.mock.calls.at(-1)?.[0].error).toHaveProperty("message", "err-49");
  });
});
