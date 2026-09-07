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
  it("toggles muted and stores the destination collection", () => {
    useScanPrefsStore.getState().setMuted(true);
    useScanPrefsStore.getState().setDestinationCollectionId("col-1");
    expect(useScanPrefsStore.getState().muted).toBe(true);
    expect(useScanPrefsStore.getState().destinationCollectionId).toBe("col-1");
  });

  it("defaults the destination to the inbox", () => {
    expect(useScanPrefsStore.getState().destinationCollectionId).toBeNull();
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

  it("defaults tap-to-scan off and stores a change", () => {
    expect(useScanPrefsStore.getState().tapToScan).toBe(false);
    useScanPrefsStore.getState().setTapToScan(true);
    expect(useScanPrefsStore.getState().tapToScan).toBe(true);
  });

  describe("persistence merge", () => {
    it("accepts valid persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        {
          muted: true,
          destinationCollectionId: "col-9",
          cardLanguage: "SC",
          autoScan: true,
          tapToScan: true,
        },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(true);
      expect(result?.destinationCollectionId).toBe("col-9");
      expect(result?.cardLanguage).toBe("SC");
      expect(result?.autoScan).toBe(true);
      expect(result?.tapToScan).toBe(true);
    });

    it("keeps a persisted null card language rather than reinstating English", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.({ cardLanguage: null }, useScanPrefsStore.getState());
      expect(result?.cardLanguage).toBeNull();
    });

    it("keeps a persisted inbox destination", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { destinationCollectionId: null, targetCollectionId: "col-7" },
        useScanPrefsStore.getState(),
      );
      expect(result?.destinationCollectionId).toBeNull();
    });

    it("falls back to defaults on malformed persisted values", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        {
          muted: "yes",
          destinationCollectionId: 42,
          cardLanguage: 7,
          autoScan: "on",
          tapToScan: 1,
        },
        useScanPrefsStore.getState(),
      );
      expect(result?.muted).toBe(false);
      expect(result?.destinationCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
      expect(result?.autoScan).toBe(false);
      expect(result?.tapToScan).toBe(false);
    });

    it("survives a null persisted blob", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(null, useScanPrefsStore.getState());
      expect(result?.muted).toBe(false);
      expect(result?.destinationCollectionId).toBeNull();
      expect(result?.cardLanguage).toBe("EN");
      expect(result?.autoScan).toBe(false);
      expect(result?.tapToScan).toBe(false);
    });

    it("carries an old target collection over as the destination", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.({ targetCollectionId: "col-7" }, useScanPrefsStore.getState());
      expect(result?.destinationCollectionId).toBe("col-7");
    });

    it("reads an old identify-only target as the inbox", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.({ targetCollectionId: "identify-only" }, useScanPrefsStore.getState());
      expect(result?.destinationCollectionId).toBeNull();
    });

    it("defaults tap-to-scan off for a blob written before the toggle existed", () => {
      const merge = useScanPrefsStore.persist.getOptions().merge;
      const result = merge?.(
        { muted: true, targetCollectionId: "col-9", cardLanguage: "EN" },
        useScanPrefsStore.getState(),
      );
      expect(result?.autoScan).toBe(false);
      expect(result?.tapToScan).toBe(false);
    });
  });
});
