import type { CollectionResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildVariantGroups, ownedCountInCollection } from "./variant-locations-popover";

const printing = (id: string) => ({ id, cardId: "c1" }) as Printing;

const makeCollection = (id: string, name: string, extra?: Partial<CollectionResponse>) =>
  ({ id, name, groupId: null, isInbox: false, ...extra }) as CollectionResponse;

const inbox = makeCollection("inbox", "Inbox", { isInbox: true });
const binderA = makeCollection("binder-a", "Binder A");
const binderB = makeCollection("binder-b", "Binder B");
const personalCollections = [inbox, binderA, binderB];

describe("buildVariantGroups", () => {
  it("sums owned copies and lists not-yet-owned collections as add candidates", () => {
    const groups = buildVariantGroups(
      [printing("p1")],
      [
        {
          printingId: "p1",
          collections: [
            { collectionId: "inbox", collectionName: "Inbox", count: 2 },
            { collectionId: "binder-a", collectionName: "Binder A", count: 1 },
          ],
        },
      ],
      personalCollections,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.total).toBe(3);
    expect(groups[0]!.locations.map((location) => location.collectionId)).toEqual([
      "inbox",
      "binder-a",
    ]);
    expect(groups[0]!.addCandidates.map((collection) => collection.id)).toEqual(["binder-b"]);
  });

  it("gives an unowned variant a zero total, no locations, and every collection as a candidate", () => {
    const groups = buildVariantGroups([printing("p1")], [], personalCollections);

    expect(groups[0]!.total).toBe(0);
    expect(groups[0]!.locations).toEqual([]);
    expect(groups[0]!.addCandidates.map((collection) => collection.id)).toEqual([
      "inbox",
      "binder-a",
      "binder-b",
    ]);
  });

  it("orders location rows by the canonical personal-collection order, not breakdown order", () => {
    const groups = buildVariantGroups(
      [printing("p1")],
      [
        {
          printingId: "p1",
          collections: [
            { collectionId: "binder-b", collectionName: "Binder B", count: 1 },
            { collectionId: "inbox", collectionName: "Inbox", count: 1 },
          ],
        },
      ],
      personalCollections,
    );

    expect(groups[0]!.locations.map((location) => location.collectionId)).toEqual([
      "inbox",
      "binder-b",
    ]);
  });

  it("returns one group per printing in input order, defaulting unlisted variants to empty", () => {
    const groups = buildVariantGroups(
      [printing("p1"), printing("p2")],
      [
        {
          printingId: "p2",
          collections: [{ collectionId: "inbox", collectionName: "Inbox", count: 1 }],
        },
      ],
      personalCollections,
    );

    expect(groups.map((group) => group.printing.id)).toEqual(["p1", "p2"]);
    expect(groups[0]!.total).toBe(0);
    expect(groups[1]!.total).toBe(1);
  });

  it("sorts the viewed collection first so `remove` highlights the row the user opened", () => {
    const groups = buildVariantGroups(
      [printing("p1")],
      [
        {
          printingId: "p1",
          collections: [
            { collectionId: "inbox", collectionName: "Inbox", count: 1 },
            { collectionId: "binder-a", collectionName: "Binder A", count: 1 },
          ],
        },
      ],
      personalCollections,
      "binder-a",
    );

    expect(groups[0]!.locations.map((location) => location.collectionId)).toEqual([
      "binder-a",
      "inbox",
    ]);
  });

  it("lists a viewed group collection as a location without offering it as an add candidate", () => {
    const groups = buildVariantGroups(
      [printing("p1")],
      [
        {
          printingId: "p1",
          collections: [{ collectionId: "bulk-box", collectionName: "Bulk box", count: 4 }],
        },
      ],
      personalCollections,
      "bulk-box",
    );

    expect(groups[0]!.total).toBe(4);
    expect(groups[0]!.locations.map((location) => location.collectionId)).toEqual(["bulk-box"]);
    expect(groups[0]!.addCandidates.map((collection) => collection.id)).toEqual([
      "inbox",
      "binder-a",
      "binder-b",
    ]);
  });
});

describe("ownedCountInCollection", () => {
  const groupWith = (
    collections: { collectionId: string; collectionName: string; count: number }[],
  ) =>
    buildVariantGroups(
      [printing("p1")],
      [{ printingId: "p1", collections }],
      personalCollections,
    )[0]!;

  it("returns the copy count held in the given collection", () => {
    const group = groupWith([
      { collectionId: "inbox", collectionName: "Inbox", count: 2 },
      { collectionId: "binder-a", collectionName: "Binder A", count: 1 },
    ]);

    expect(ownedCountInCollection(group, "inbox")).toBe(2);
    expect(ownedCountInCollection(group, "binder-a")).toBe(1);
  });

  it("returns 0 when the variant is not held in that collection (header `-` disabled)", () => {
    const group = groupWith([{ collectionId: "binder-a", collectionName: "Binder A", count: 3 }]);

    expect(ownedCountInCollection(group, "inbox")).toBe(0);
  });

  it("returns 0 for an unowned variant with no locations", () => {
    const group = buildVariantGroups([printing("p1")], [], personalCollections)[0]!;

    expect(ownedCountInCollection(group, "inbox")).toBe(0);
  });

  it("counts copies in a viewed group collection so the header `-` stays live there", () => {
    const group = buildVariantGroups(
      [printing("p1")],
      [
        {
          printingId: "p1",
          collections: [{ collectionId: "bulk-box", collectionName: "Bulk box", count: 4 }],
        },
      ],
      personalCollections,
      "bulk-box",
    )[0]!;

    expect(ownedCountInCollection(group, "bulk-box")).toBe(4);
  });
});
