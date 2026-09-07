import { describe, expect, it } from "vitest";

import { toCollection, toCollectionEvent } from "./collection-presenters.js";

const NOW = new Date("2025-06-15T12:00:00.000Z");
const LATER = new Date("2025-06-16T08:30:00.000Z");

describe("toCollection", () => {
  it("maps a collection row with date serialization", () => {
    const result = toCollection({
      id: "col-1",
      userId: "user-1",
      groupId: null,
      name: "My Cards",
      description: "A collection",
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      isPublic: false,
      shareToken: "tok-abc",
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect(result).toEqual({
      id: "col-1",
      name: "My Cards",
      description: "A collection",
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      isPublic: false,
      shareToken: "tok-abc",
      copyCount: 0,
      totalValueCents: null,
      unpricedCopyCount: null,
      createdAt: "2025-06-15T12:00:00.000Z",
      updatedAt: "2025-06-16T08:30:00.000Z",
      groupId: null,
      groupSlug: null,
      groupName: null,
      viewerCanAdmin: true,
      sidebarHidden: false,
      homeDecks: [],
    });
  });

  it("names the decks stored in the collection", () => {
    const row = {
      id: "col-1",
      userId: "user-1",
      groupId: null,
      name: "Deckbox 1",
      description: null,
      availableForDeckbuilding: false,
      isInbox: false,
      sortOrder: 1,
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    };
    expect(
      toCollection(row, undefined, [{ id: "deck-1", name: "Sunfire Aggro" }]).homeDecks,
    ).toEqual([{ id: "deck-1", name: "Sunfire Aggro" }]);
    expect(toCollection(row).homeDecks).toEqual([]);
  });

  it("presents the viewer's sidebar-hidden preference, defaulting to visible", () => {
    const row = {
      id: "col-1",
      userId: "user-1",
      groupId: null,
      name: "Retired binder",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 1,
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    };
    expect(toCollection({ ...row, sidebarHidden: true }).sidebarHidden).toBe(true);
    expect(toCollection(row).sidebarHidden).toBe(false);
  });

  it("excludes userId from the response", () => {
    const result = toCollection({
      id: "col-1",
      userId: "user-1",
      groupId: null,
      name: "Test",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
    });
    expect("userId" in result).toBe(false);
  });

  it("emits group context and viewerCanAdmin for shared collections", () => {
    const result = toCollection({
      id: "col-2",
      userId: null,
      groupId: "g-1",
      name: "Pool",
      description: null,
      availableForDeckbuilding: true,
      isInbox: false,
      sortOrder: 0,
      isPublic: false,
      shareToken: null,
      createdAt: NOW,
      updatedAt: LATER,
      groupSlug: "friday-night",
      groupName: "Friday Night",
      viewerCanAdmin: false,
    });
    expect(result.groupId).toBe("g-1");
    expect(result.groupSlug).toBe("friday-night");
    expect(result.groupName).toBe("Friday Night");
    expect(result.viewerCanAdmin).toBe(false);
  });
});

describe("toCollectionEvent", () => {
  it("maps an enriched collection event row", () => {
    const result = toCollectionEvent({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: NOW,
      shortCode: "OGS-005",
      rarity: "rare",
      imageId: "uuid-base",
      cardName: "Shadow Knight",
      cardTypes: ["unit"],
      cardSuperTypes: ["champion"],
      tags: ["Hecarim"],
    });
    expect(result).toEqual({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: "2025-06-15T12:00:00.000Z",
      shortCode: "OGS-005",
      rarity: "rare",
      imageId: "uuid-base",
      cardName: "Shadow Knight",
      cardTypes: ["unit"],
      cardSuperTypes: ["champion"],
      tags: ["Hecarim"],
    });
  });

  it("maps null imageId to null", () => {
    const result = toCollectionEvent({
      id: "ev-1",
      action: "added",
      copyId: "copy-1",
      printingId: "p-1",
      fromCollectionId: null,
      fromCollectionName: null,
      toCollectionId: "col-1",
      toCollectionName: "Main",
      createdAt: NOW,
      shortCode: "OGS-005",
      rarity: "rare",
      imageId: null,
      cardName: "Shadow Knight",
      cardTypes: ["unit"],
      cardSuperTypes: ["champion"],
      tags: [],
    });
    expect(result.imageId).toBeNull();
  });
});
