import { describe, expect, it } from "vitest";

import type { BoxWantRow } from "@/features/decks/lib/box-wants";
import { buildBoxWantsLookup, EMPTY_BOX_WANTS } from "@/features/decks/lib/box-wants";

const row = (
  collectionId: string,
  printingId: string,
  cardId: string,
  fulfillableQuantity = 1,
): BoxWantRow => ({ collectionId, printingId, cardId, fulfillableQuantity });

describe("buildBoxWantsLookup", () => {
  it("reports the takeable quantity per printing", () => {
    const lookup = buildBoxWantsLookup([row("box-1", "p-1", "c-1", 3)]);

    expect(lookup.fulfillable("box-1", "p-1")).toBe(3);
    expect(lookup.fulfillable("box-1", "p-2")).toBe(0);
    expect(lookup.fulfillable("box-2", "p-1")).toBe(0);
  });

  it("matches a card through any of its printings", () => {
    const lookup = buildBoxWantsLookup([row("box-1", "p-foil", "c-1")]);

    expect(lookup.wantsCard("box-1", "c-1")).toBe(true);
    expect(lookup.wantsCard("box-1", "c-2")).toBe(false);
    expect(lookup.wantsCard("box-2", "c-1")).toBe(false);
  });

  it("counts distinct cards per box and across boxes", () => {
    const lookup = buildBoxWantsLookup([
      // Two printings of the same card in one box count once.
      row("box-1", "p-1", "c-1"),
      row("box-1", "p-2", "c-1"),
      row("box-1", "p-3", "c-2"),
      // The same card in a second box counts once in the total.
      row("box-2", "p-4", "c-2"),
      row("box-2", "p-5", "c-3"),
    ]);

    expect(lookup.wantedCardCount("box-1")).toBe(2);
    expect(lookup.wantedCardCount("box-2")).toBe(2);
    expect(lookup.wantedCardCount("box-3")).toBe(0);
    expect(lookup.wantedCardCount()).toBe(3);
  });

  it("sums duplicate rows for the same printing", () => {
    const lookup = buildBoxWantsLookup([row("box-1", "p-1", "c-1", 2), row("box-1", "p-1", "c-1")]);

    expect(lookup.fulfillable("box-1", "p-1")).toBe(3);
    expect(lookup.wantedCardCount("box-1")).toBe(1);
  });

  it("picks the box holding the most wanted cards", () => {
    const lookup = buildBoxWantsLookup([
      row("box-1", "p-1", "c-1"),
      row("box-2", "p-2", "c-2"),
      row("box-2", "p-3", "c-3"),
    ]);

    expect(lookup.bestCollection(["box-1", "box-2"])).toBe("box-2");
    expect(lookup.bestCollection(["box-2", "box-1"])).toBe("box-2");
  });

  it("breaks a tie in favour of the first candidate", () => {
    const lookup = buildBoxWantsLookup([row("box-1", "p-1", "c-1"), row("box-2", "p-2", "c-2")]);

    expect(lookup.bestCollection(["box-1", "box-2"])).toBe("box-1");
    expect(lookup.bestCollection(["box-2", "box-1"])).toBe("box-2");
  });

  it("has no best box when none of the candidates holds a wanted card", () => {
    const lookup = buildBoxWantsLookup([row("box-1", "p-1", "c-1")]);

    expect(lookup.bestCollection(["box-2", "box-3"])).toBeUndefined();
    expect(lookup.bestCollection([])).toBeUndefined();
  });

  it("answers everything as empty for no rows", () => {
    const lookup = buildBoxWantsLookup([]);

    expect(lookup.fulfillable("box-1", "p-1")).toBe(0);
    expect(lookup.wantsCard("box-1", "c-1")).toBe(false);
    expect(lookup.wantedCardCount("box-1")).toBe(0);
    expect(lookup.wantedCardCount()).toBe(0);
    expect(lookup.bestCollection(["box-1"])).toBeUndefined();
  });

  it("exposes a shared empty lookup", () => {
    expect(EMPTY_BOX_WANTS.wantedCardCount()).toBe(0);
    expect(EMPTY_BOX_WANTS.fulfillable("box-1", "p-1")).toBe(0);
  });
});
