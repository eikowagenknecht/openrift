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

  it("stores a mixed-language stack as no preference at all", () => {
    useScanPrefsStore.getState().setCardLanguage(null);
    expect(useScanPrefsStore.getState().cardLanguage).toBeNull();
  });

  it("defaults auto-scan off and stores a change", () => {
    expect(useScanPrefsStore.getState().autoScan).toBe(false);
    useScanPrefsStore.getState().setAutoScan(true);
    expect(useScanPrefsStore.getState().autoScan).toBe(true);
  });

  describe("persistence merge", () => {
    it("accepts valid persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: true, targetCollectionId: "col-9", cardLanguage: "SC", autoScan: true },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(true);
      expect(result?.targetCollectionId).toBe("col-9");
      expect(result?.cardLanguage).toBe("SC");
      expect(result?.autoScan).toBe(true);
    });

    it("keeps a persisted null card language rather than reinstating English", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.({ cardLanguage: null }, useScanPrefsStore.getState());
      expect(result?.cardLanguage).toBeNull();
    });

    it("falls back to defaults on malformed persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: "yes", targetCollectionId: 42, cardLanguage: 7, autoScan: "on" },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(false);
      expect(result?.targetCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
      expect(result?.autoScan).toBe(false);
    });

    it("survives a null persisted blob", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(null, useScanPrefsStore.getState());
      expect(result?.muted).toBe(false);
      expect(result?.targetCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
      expect(result?.autoScan).toBe(false);
    });

    it("defaults auto-scan off for a blob written before the toggle existed", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: true, targetCollectionId: "col-9", cardLanguage: "EN" },
        useScanPrefsStore.getState(),
      );
      expect(result?.autoScan).toBe(false);
    });
  });
});
