import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useScanPrefsStore } from "./scan-prefs-store";

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useScanPrefsStore);
});

afterEach(() => {
  resetStore();
});

describe("useScanPrefsStore", () => {
  it("toggles muted and stores the target collection", () => {
    useScanPrefsStore.getState().setMuted(true);
    useScanPrefsStore.getState().setTargetCollectionId("col-1");
    expect(useScanPrefsStore.getState().muted).toBe(true);
    expect(useScanPrefsStore.getState().targetCollectionId).toBe("col-1");
  });

  it("defaults the card language to English and stores a change", () => {
    expect(useScanPrefsStore.getState().cardLanguage).toBe("EN");
    useScanPrefsStore.getState().setCardLanguage("SC");
    expect(useScanPrefsStore.getState().cardLanguage).toBe("SC");
  });

  describe("persistence merge", () => {
    it("accepts valid persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: true, targetCollectionId: "col-9", cardLanguage: "SC" },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(true);
      expect(result?.targetCollectionId).toBe("col-9");
      expect(result?.cardLanguage).toBe("SC");
    });

    it("falls back to defaults on malformed persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: "yes", targetCollectionId: 42, cardLanguage: 7 },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(false);
      expect(result?.targetCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
    });

    it("survives a null persisted blob", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(null, useScanPrefsStore.getState());
      expect(result?.muted).toBe(false);
      expect(result?.targetCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
    });
  });
});
