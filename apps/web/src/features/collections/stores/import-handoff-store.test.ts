import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useImportHandoffStore } from "./import-handoff-store";

const resetStore = createStoreResetter(useImportHandoffStore);

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

describe("useImportHandoffStore", () => {
  it("starts with no handoff", () => {
    expect(useImportHandoffStore.getState().handoff).toBeNull();
  });

  it("stores a handoff with a target collection", () => {
    useImportHandoffStore.getState().setHandoff({ rawText: "1 Yasuo", collectionId: "col-1" });

    expect(useImportHandoffStore.getState().handoff).toEqual({
      rawText: "1 Yasuo",
      collectionId: "col-1",
    });
  });

  it("stores a handoff without a target collection", () => {
    useImportHandoffStore.getState().setHandoff({ rawText: "1 Yasuo" });

    expect(useImportHandoffStore.getState().handoff).toEqual({ rawText: "1 Yasuo" });
  });

  it("takeHandoff returns the stored handoff and clears it", () => {
    useImportHandoffStore.getState().setHandoff({ rawText: "1 Yasuo", collectionId: "col-1" });

    const taken = useImportHandoffStore.getState().takeHandoff();

    expect(taken).toEqual({ rawText: "1 Yasuo", collectionId: "col-1" });
    expect(useImportHandoffStore.getState().handoff).toBeNull();
  });

  it("takeHandoff returns null when nothing was handed off", () => {
    expect(useImportHandoffStore.getState().takeHandoff()).toBeNull();
  });
});
