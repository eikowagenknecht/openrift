import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useRulesShowChangesStore } from "./rules-show-changes-store";

describe("rules-show-changes-store", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetStore = createStoreResetter(useRulesShowChangesStore);
  });

  afterEach(() => {
    resetStore();
  });

  it("defaults to off for both kinds", () => {
    const { byKind } = useRulesShowChangesStore.getState();
    expect(byKind).toEqual({ core: false, tournament: false });
  });

  it("setShow flips a single kind without affecting the other", () => {
    useRulesShowChangesStore.getState().setShow("core", true);
    expect(useRulesShowChangesStore.getState().byKind).toEqual({
      core: true,
      tournament: false,
    });
    useRulesShowChangesStore.getState().setShow("tournament", true);
    expect(useRulesShowChangesStore.getState().byKind).toEqual({
      core: true,
      tournament: true,
    });
  });

  it("setShow can flip a kind back off", () => {
    useRulesShowChangesStore.getState().setShow("core", true);
    useRulesShowChangesStore.getState().setShow("core", false);
    expect(useRulesShowChangesStore.getState().byKind.core).toBe(false);
  });

  it("reset returns to defaults", () => {
    useRulesShowChangesStore.getState().setShow("core", true);
    useRulesShowChangesStore.getState().setShow("tournament", true);
    useRulesShowChangesStore.getState().reset();
    expect(useRulesShowChangesStore.getState().byKind).toEqual({
      core: false,
      tournament: false,
    });
  });
});
