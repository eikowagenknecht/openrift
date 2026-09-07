import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import { describe, expect, it } from "vitest";

import { resolveTradeAddTarget } from "./trade-add-target";

function col(overrides: Partial<CollectionResponse> = {}): CollectionResponse {
  return {
    id: "c1",
    name: "Collection",
    description: null,
    availableForDeckbuilding: true,
    sidebarHidden: false,
    isInbox: false,
    sortOrder: 0,
    isPublic: false,
    shareToken: null,
    copyCount: 0,
    totalValueCents: 0,
    unpricedCopyCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    groupId: null,
    groupSlug: null,
    groupName: null,
    viewerCanAdmin: true,
    homeDecks: [],
    ...overrides,
  };
}

const inbox = col({ id: "inbox-1", name: "Inbox", isInbox: true });
const binder = col({ id: "binder-1", name: "Trade binder" });

describe("resolveTradeAddTarget", () => {
  it("falls back to the inbox when nothing is remembered", () => {
    expect(resolveTradeAddTarget(null, [inbox, binder])).toEqual({ label: "inbox" });
  });

  it("stays on the inbox while the collections load", () => {
    expect(resolveTradeAddTarget(null, undefined)).toEqual({ label: "inbox" });
  });

  it("names the remembered collection once it is found", () => {
    expect(
      resolveTradeAddTarget({ id: "binder-1", name: "Trade binder" }, [inbox, binder]),
    ).toEqual({ collectionId: "binder-1", label: "Trade binder" });
  });

  it("prefers the live name over the remembered one after a rename", () => {
    const renamed = col({ id: "binder-1", name: "Swap box" });
    expect(resolveTradeAddTarget({ id: "binder-1", name: "Trade binder" }, [renamed])).toEqual({
      collectionId: "binder-1",
      label: "Swap box",
    });
  });

  it("uses the remembered name before the collections arrive", () => {
    expect(resolveTradeAddTarget({ id: "binder-1", name: "Trade binder" }, undefined)).toEqual({
      collectionId: "binder-1",
      label: "Trade binder",
    });
  });

  it("drops a remembered collection that no longer exists", () => {
    expect(resolveTradeAddTarget({ id: "gone-1", name: "Old binder" }, [inbox, binder])).toEqual({
      label: "inbox",
    });
  });

  it("sends no id when the remembered collection is the inbox", () => {
    expect(resolveTradeAddTarget({ id: "inbox-1", name: "Inbox" }, [inbox, binder])).toEqual({
      label: "inbox",
    });
  });

  it("falls back to the inbox against an empty collection list", () => {
    expect(resolveTradeAddTarget({ id: "binder-1", name: "Trade binder" }, [])).toEqual({
      label: "inbox",
    });
  });
});
