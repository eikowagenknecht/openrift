import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { usePageTocStore } from "./page-toc-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(usePageTocStore);
});

afterEach(() => {
  resetStore();
});

describe("usePageTocStore", () => {
  it("starts with no active id", () => {
    expect(usePageTocStore.getState().activeId).toBeNull();
  });

  it("setActiveId updates the id", () => {
    usePageTocStore.getState().setActiveId("rule-103");
    expect(usePageTocStore.getState().activeId).toBe("rule-103");
  });

  it("setActiveId accepts null to clear the id", () => {
    usePageTocStore.getState().setActiveId("rule-103");
    usePageTocStore.getState().setActiveId(null);
    expect(usePageTocStore.getState().activeId).toBeNull();
  });

  it("setActiveId is a no-op when the id is unchanged (preserves state reference)", () => {
    usePageTocStore.getState().setActiveId("rule-103");
    const before = usePageTocStore.getState();
    usePageTocStore.getState().setActiveId("rule-103");
    const after = usePageTocStore.getState();
    expect(after).toBe(before);
  });
});
