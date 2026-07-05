import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useAdminSettingsStore } from "./use-admin-settings";

vi.mock("@/hooks/use-admin", () => ({ useIsAdmin: () => ({ data: false }) }));

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useAdminSettingsStore);
});

afterEach(() => {
  resetStore();
  localStorage.removeItem("admin-settings");
});

describe("useAdminSettingsStore", () => {
  it("defaults the debug overlay off and toggles via update", () => {
    expect(useAdminSettingsStore.getState().settings.debugOverlay).toBe(false);
    useAdminSettingsStore.getState().update({ debugOverlay: true });
    expect(useAdminSettingsStore.getState().settings.debugOverlay).toBe(true);
  });
});

describe("rehydrate validation", () => {
  it("keeps a valid persisted value", async () => {
    localStorage.setItem(
      "admin-settings",
      JSON.stringify({ state: { settings: { debugOverlay: true } }, version: 0 }),
    );
    await useAdminSettingsStore.persist.rehydrate();
    expect(useAdminSettingsStore.getState().settings.debugOverlay).toBe(true);
  });

  it("falls back to defaults for junk values and corrupt blobs", async () => {
    localStorage.setItem(
      "admin-settings",
      JSON.stringify({ state: { settings: { debugOverlay: "yes", stray: 1 } }, version: 0 }),
    );
    await useAdminSettingsStore.persist.rehydrate();
    expect(useAdminSettingsStore.getState().settings).toEqual({ debugOverlay: false });

    localStorage.setItem("admin-settings", JSON.stringify({ state: null, version: 0 }));
    await useAdminSettingsStore.persist.rehydrate();
    expect(useAdminSettingsStore.getState().settings).toEqual({ debugOverlay: false });
  });
});
