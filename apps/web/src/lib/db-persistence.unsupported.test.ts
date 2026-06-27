// Unmocked integration of the graceful-degradation path: jsdom has neither
// `Worker` nor `navigator.storage.getDirectory`, so the real OPFS open must
// fail its feature detection and persistence must settle to null — the same
// path a real unsupported browser takes. No mocks, real package code.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPersistenceSnapshot,
  resetPersistenceForTesting,
  subscribeToPersistence,
} from "./db-persistence";

beforeEach(() => {
  resetPersistenceForTesting();
});

afterEach(() => {
  resetPersistenceForTesting();
});

describe("db-persistence in a runtime without OPFS support", () => {
  it("settles to ready(null) instead of throwing", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      subscribeToPersistence(() => {});

      await vi.waitFor(() => {
        expect(getPersistenceSnapshot()).toEqual({ status: "ready", persistence: null });
      });
      expect(infoSpy).toHaveBeenCalledOnce();
    } finally {
      infoSpy.mockRestore();
    }
  });
});
