import { describe, expect, it } from "vitest";

import type { OwnershipBandSources } from "@/lib/deck-ownership-band";
import {
  buildOwnershipBands,
  collectOwnershipBandSources,
  ownershipBandSegments,
  ownershipBandTitle,
  sameOwnershipBandSources,
} from "@/lib/deck-ownership-band";
import { stubDeckBuilderCard } from "@/test/factories";

/** The card the scenarios below build decks from: one standard, one foil printing. */
const CARD = "card-1";
const STANDARD = "printing-standard";
const FOIL = "printing-foil";

/**
 * Sources for a single card whose entries display the printings given per deck
 * card key, with `STANDARD` as the card's default art.
 * @returns Lookups ready for `buildOwnershipBands`.
 */
function sourcesFor(
  availableByPrinting: Record<string, number>,
  displayedPrintingIdByCardKey: Record<string, string>,
  availableByCardId?: Record<string, number>,
  lockedByCardId?: Record<string, number>,
  borrowedByCardId?: Record<string, number>,
): OwnershipBandSources {
  return {
    availableByPrinting,
    availableByCardId: availableByCardId ?? {
      [CARD]: Object.values(availableByPrinting).reduce((sum, count) => sum + count, 0),
    },
    lockedByCardId: lockedByCardId ?? {},
    borrowedByCardId: borrowedByCardId ?? {},
    displayedPrintingIdByCardKey,
  };
}

describe("ownershipBandSegments", () => {
  it("fills the band with the printing on screen first", () => {
    expect(ownershipBandSegments(3, 3, 0)).toEqual({
      exact: 3,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("covers the remainder with other printings", () => {
    expect(ownershipBandSegments(3, 2, 1)).toEqual({
      exact: 2,
      other: 1,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(ownershipBandSegments(3, 0, 2)).toEqual({
      exact: 0,
      other: 2,
      borrowed: 0,
      locked: 0,
      missing: 1,
    });
  });

  it("leaves the copies the viewer lacks as missing", () => {
    expect(ownershipBandSegments(4, 1, 0)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 3,
    });
    expect(ownershipBandSegments(2, 0, 0)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 2,
    });
  });

  it("never counts more copies than the entry needs", () => {
    expect(ownershipBandSegments(2, 5, 5)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(ownershipBandSegments(2, 1, 9)).toEqual({
      exact: 1,
      other: 1,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("returns an empty split for an entry that needs nothing", () => {
    expect(ownershipBandSegments(0, 3, 3)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(ownershipBandSegments(-2, 3, 3)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("ignores negative counts", () => {
    expect(ownershipBandSegments(2, -1, -1)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 2,
    });
  });

  it("covers the shortfall with locked copies before calling it missing", () => {
    expect(ownershipBandSegments(3, 2, 0, 0, 1)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 1,
      missing: 0,
    });
    expect(ownershipBandSegments(4, 0, 1, 0, 1)).toEqual({
      exact: 0,
      other: 1,
      borrowed: 0,
      locked: 1,
      missing: 2,
    });
    expect(ownershipBandSegments(2, 0, 0, 0, 5)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 2,
      missing: 0,
    });
  });

  it("covers the shortfall with borrowed copies before locked ones", () => {
    // Borrowed copies are buildable and locked ones aren't, so the band has to
    // spend the borrowed pool first — otherwise a card the viewer can actually
    // sleeve would paint as unavailable.
    expect(ownershipBandSegments(3, 1, 0, 1, 1)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 1,
      locked: 1,
      missing: 0,
    });
    expect(ownershipBandSegments(2, 0, 0, 1, 5)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 1,
      locked: 1,
      missing: 0,
    });
  });

  // Regression: a deck built entirely from a friend's cards used to paint the
  // whole band amber-missing while the shortfall figures said it was complete.
  it("bands a fully-borrowed entry as borrowed, not missing", () => {
    expect(ownershipBandSegments(2, 0, 0, 2)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 2,
      locked: 0,
      missing: 0,
    });
  });

  it("never counts more borrowed copies than the entry needs", () => {
    expect(ownershipBandSegments(2, 1, 0, 9)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 1,
      locked: 0,
      missing: 0,
    });
  });
});

describe("buildOwnershipBands", () => {
  it("splits a stack across the printings owned", () => {
    // The reported scenario: 3 copies in one stack, 2 standard + 1 foil owned.
    const stack = stubDeckBuilderCard({ cardId: CARD, quantity: 3 });
    const bands = buildOwnershipBands(
      [stack],
      sourcesFor({ [STANDARD]: 2, [FOIL]: 1 }, { [`${CARD}|main|`]: STANDARD }),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 2,
      other: 1,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("bands both halves of the same stack split by printing", () => {
    // The same three copies, pinned as standard ×2 plus foil ×1: each entry is
    // judged against its own printing, so both come out fully owned.
    const standard = stubDeckBuilderCard({
      cardId: CARD,
      quantity: 2,
      preferredPrintingId: STANDARD,
    });
    const foil = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: FOIL });
    const bands = buildOwnershipBands(
      [standard, foil],
      sourcesFor(
        { [STANDARD]: 2, [FOIL]: 1 },
        { [`${CARD}|main|${STANDARD}`]: STANDARD, [`${CARD}|main|${FOIL}`]: FOIL },
      ),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|${STANDARD}`)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(bands.get(`${CARD}|main|${FOIL}`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("never claims one copy for two entries showing the same printing", () => {
    const pinned = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: FOIL });
    const unpinned = stubDeckBuilderCard({ cardId: CARD, quantity: 1, zone: "sideboard" });
    const bands = buildOwnershipBands(
      [pinned, unpinned],
      sourcesFor(
        { [FOIL]: 1 },
        { [`${CARD}|main|${FOIL}`]: FOIL, [`${CARD}|sideboard|`]: FOIL },
        { [CARD]: 1 },
      ),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|${FOIL}`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(bands.has(`${CARD}|sideboard|`)).toBe(false);
  });

  it("gives a later entry its own printing instead of spending it as a substitute", () => {
    // Without the two-pass split, the unpinned ×3 entry would take the foil as
    // an "other printing" copy and leave the foil entry with no band at all.
    const unpinned = stubDeckBuilderCard({ cardId: CARD, quantity: 3 });
    const foil = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: FOIL });
    const bands = buildOwnershipBands(
      [unpinned, foil],
      sourcesFor(
        { [STANDARD]: 2, [FOIL]: 1 },
        { [`${CARD}|main|`]: STANDARD, [`${CARD}|main|${FOIL}`]: FOIL },
      ),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 1,
    });
    expect(bands.get(`${CARD}|main|${FOIL}`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("leaves the copies the viewer is short of as a missing remainder", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 3 });
    const bands = buildOwnershipBands(
      [card],
      sourcesFor({ [STANDARD]: 1 }, { [`${CARD}|main|`]: STANDARD }),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 2,
    });
  });

  it("renders no band for a card the viewer owns none of", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 2 });
    const bands = buildOwnershipBands(
      [card],
      sourcesFor({}, { [`${CARD}|main|`]: STANDARD }, { [CARD]: 0 }),
      undefined,
      false,
    );

    expect(bands.size).toBe(0);
  });

  it("hands copies to the deck proper before the sideboard", () => {
    const main = stubDeckBuilderCard({ cardId: CARD, quantity: 2 });
    const sideboard = stubDeckBuilderCard({ cardId: CARD, quantity: 1, zone: "sideboard" });
    const bands = buildOwnershipBands(
      [main, sideboard],
      sourcesFor(
        { [STANDARD]: 2 },
        { [`${CARD}|main|`]: STANDARD, [`${CARD}|sideboard|`]: STANDARD },
      ),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(bands.has(`${CARD}|sideboard|`)).toBe(false);
  });

  it("lets the deck proper claim before overflow, whatever the deck order", () => {
    const overflow = stubDeckBuilderCard({ cardId: CARD, quantity: 1, zone: "overflow" });
    const main = stubDeckBuilderCard({ cardId: CARD, quantity: 1 });
    const bands = buildOwnershipBands(
      [overflow, main],
      sourcesFor(
        { [STANDARD]: 1 },
        { [`${CARD}|main|`]: STANDARD, [`${CARD}|overflow|`]: STANDARD },
      ),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
    expect(bands.has(`${CARD}|overflow|`)).toBe(false);
  });

  it("judges against the owned printing while show-my-printings is on", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: STANDARD });
    const sources = sourcesFor({ [FOIL]: 1 }, { [`${CARD}|main|${STANDARD}`]: STANDARD });
    const ownedPrintings = new Map([[CARD, { id: FOIL, imageId: "img-foil" }]]);

    expect(
      buildOwnershipBands([card], sources, ownedPrintings, true).get(`${CARD}|main|${STANDARD}`),
    ).toEqual({ exact: 1, other: 0, borrowed: 0, locked: 0, missing: 0 });
    // Toggle off, the thumbnail shows the pinned standard art again.
    expect(
      buildOwnershipBands([card], sources, ownedPrintings, false).get(`${CARD}|main|${STANDARD}`),
    ).toEqual({ exact: 0, other: 1, borrowed: 0, locked: 0, missing: 0 });
  });

  it("keeps the entry's own printing when the owned one has no art", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: STANDARD });
    const bands = buildOwnershipBands(
      [card],
      sourcesFor({ [STANDARD]: 1 }, { [`${CARD}|main|${STANDARD}`]: STANDARD }),
      new Map([[CARD, { id: FOIL, imageId: undefined }]]),
      true,
    );

    expect(bands.get(`${CARD}|main|${STANDARD}`)).toEqual({
      exact: 1,
      other: 0,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("still bands an entry whose printing didn't resolve", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 1 });
    const bands = buildOwnershipBands([card], sourcesFor({ [STANDARD]: 1 }, {}), undefined, false);

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 0,
      other: 1,
      borrowed: 0,
      locked: 0,
      missing: 0,
    });
  });

  it("returns an empty map for a deck with no cards", () => {
    expect(buildOwnershipBands([], sourcesFor({}, {}, {}), undefined, false).size).toBe(0);
  });

  it("draws locked copies from one per-card pool across zones", () => {
    const main = stubDeckBuilderCard({ cardId: CARD, quantity: 3, zone: "main" });
    const side = stubDeckBuilderCard({ cardId: CARD, quantity: 2, zone: "sideboard" });
    const bands = buildOwnershipBands(
      [main, side],
      sourcesFor(
        { [STANDARD]: 2 },
        { [`${CARD}|main|`]: STANDARD, [`${CARD}|sideboard|`]: STANDARD },
        undefined,
        { [CARD]: 1 },
      ),
      undefined,
      false,
    );

    // Main claims both available copies plus the single locked one; the
    // sideboard entry is left with nothing at all, so it carries no band.
    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 2,
      other: 0,
      borrowed: 0,
      locked: 1,
      missing: 0,
    });
    expect(bands.get(`${CARD}|sideboard|`)).toBeUndefined();
  });

  it("gives a locked-only entry a band", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 2 });
    const bands = buildOwnershipBands(
      [card],
      sourcesFor({}, { [`${CARD}|main|`]: STANDARD }, { [CARD]: 0 }, { [CARD]: 1 }),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 0,
      locked: 1,
      missing: 1,
    });
  });

  it("draws borrowed copies from one per-card pool across zones", () => {
    const main = stubDeckBuilderCard({ cardId: CARD, quantity: 2, zone: "main" });
    const side = stubDeckBuilderCard({ cardId: CARD, quantity: 2, zone: "sideboard" });
    const bands = buildOwnershipBands(
      [main, side],
      sourcesFor(
        {},
        { [`${CARD}|main|`]: STANDARD, [`${CARD}|sideboard|`]: STANDARD },
        { [CARD]: 0 },
        undefined,
        { [CARD]: 3 },
      ),
      undefined,
      false,
    );

    // Two of the three borrowed copies cover the main deck; the third is all
    // the sideboard entry gets, so it bands one borrowed and one missing.
    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 2,
      locked: 0,
      missing: 0,
    });
    expect(bands.get(`${CARD}|sideboard|`)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 1,
      locked: 0,
      missing: 1,
    });
  });

  it("gives a borrowed-only entry a band", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 2 });
    const bands = buildOwnershipBands(
      [card],
      sourcesFor({}, { [`${CARD}|main|`]: STANDARD }, { [CARD]: 0 }, undefined, { [CARD]: 2 }),
      undefined,
      false,
    );

    expect(bands.get(`${CARD}|main|`)).toEqual({
      exact: 0,
      other: 0,
      borrowed: 2,
      locked: 0,
      missing: 0,
    });
  });
});

describe("collectOwnershipBandSources", () => {
  it("sums a card's copies across its printings and resolves each entry's art", () => {
    const unpinned = stubDeckBuilderCard({ cardId: CARD, quantity: 1 });
    const pinned = stubDeckBuilderCard({ cardId: CARD, quantity: 1, preferredPrintingId: FOIL });
    const printings = new Map([[CARD, [{ id: STANDARD }, { id: FOIL }]]]);

    const sources = collectOwnershipBandSources(
      [unpinned, pinned],
      printings,
      (cardId, preferredPrintingId) =>
        preferredPrintingId ? { id: preferredPrintingId } : { id: `${cardId}-default` },
      { [STANDARD]: 2, [FOIL]: 1 },
      { [FOIL]: 1 },
    );

    expect(sources.availableByCardId).toEqual({ [CARD]: 3 });
    expect(sources.lockedByCardId).toEqual({ [CARD]: 1 });
    expect(sources.displayedPrintingIdByCardKey).toEqual({
      [`${CARD}|main|`]: `${CARD}-default`,
      [`${CARD}|main|${FOIL}`]: FOIL,
    });
  });

  it("reports zero for a card with no printings and skips unresolvable entries", () => {
    const card = stubDeckBuilderCard({ cardId: CARD, quantity: 1 });

    const sources = collectOwnershipBandSources([card], new Map(), () => undefined, {}, {});

    expect(sources.availableByCardId).toEqual({ [CARD]: 0 });
    expect(sources.displayedPrintingIdByCardKey).toEqual({});
  });
});

describe("sameOwnershipBandSources", () => {
  it("treats a rebuilt but identical set as unchanged", () => {
    const displayed = { [`${CARD}|main|`]: STANDARD };
    expect(
      sameOwnershipBandSources(
        sourcesFor({ [STANDARD]: 2 }, displayed),
        sourcesFor({ [STANDARD]: 2 }, { ...displayed }),
      ),
    ).toBe(true);
  });

  it("spots a changed count, a new entry, and a dropped entry", () => {
    const base = sourcesFor({ [STANDARD]: 2 }, { [`${CARD}|main|`]: STANDARD });
    expect(
      sameOwnershipBandSources(
        base,
        sourcesFor({ [STANDARD]: 3 }, base.displayedPrintingIdByCardKey),
      ),
    ).toBe(false);
    expect(
      sameOwnershipBandSources(
        base,
        sourcesFor({ [STANDARD]: 2 }, { ...base.displayedPrintingIdByCardKey, extra: FOIL }),
      ),
    ).toBe(false);
    expect(sameOwnershipBandSources(base, sourcesFor({ [STANDARD]: 2 }, {}))).toBe(false);
    expect(sameOwnershipBandSources(base, { ...base, lockedByCardId: { [CARD]: 1 } })).toBe(false);
    // A returned or newly-acknowledged loan changes only this lookup, so
    // skipping it here would freeze the bands until something else moved.
    expect(sameOwnershipBandSources(base, { ...base, borrowedByCardId: { [CARD]: 1 } })).toBe(
      false,
    );
  });

  it("handles the undefined ends", () => {
    const base = sourcesFor({}, {}, {});
    expect(sameOwnershipBandSources(undefined, undefined)).toBe(true);
    expect(sameOwnershipBandSources(base, undefined)).toBe(false);
    expect(sameOwnershipBandSources(undefined, base)).toBe(false);
  });
});

describe("ownershipBandTitle", () => {
  it("words a fully-owned entry", () => {
    expect(ownershipBandTitle(1, { exact: 1, other: 0, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own this printing",
    );
    expect(ownershipBandTitle(3, { exact: 3, other: 0, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own all 3 in this printing",
    );
  });

  it("words an entry covered entirely by other printings", () => {
    expect(ownershipBandTitle(1, { exact: 0, other: 1, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own this card in another printing",
    );
    expect(ownershipBandTitle(2, { exact: 0, other: 2, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own all 2 in another printing",
    );
  });

  it("words a mixed entry", () => {
    expect(ownershipBandTitle(3, { exact: 2, other: 1, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own 2 of 3 in this printing and 1 in another",
    );
  });

  it("words a partly-owned entry", () => {
    expect(ownershipBandTitle(3, { exact: 1, other: 0, borrowed: 0, locked: 0, missing: 2 })).toBe(
      "You own 1 of 3 in this printing",
    );
    expect(ownershipBandTitle(3, { exact: 0, other: 1, borrowed: 0, locked: 0, missing: 2 })).toBe(
      "You own 1 of 3 in another printing",
    );
  });

  it("mentions locked copies", () => {
    expect(ownershipBandTitle(3, { exact: 2, other: 0, borrowed: 0, locked: 1, missing: 0 })).toBe(
      "You own 2 of 3 in this printing, 1 more is locked",
    );
    expect(ownershipBandTitle(4, { exact: 1, other: 1, borrowed: 0, locked: 2, missing: 0 })).toBe(
      "You own 1 of 4 in this printing and 1 in another, 2 more are locked",
    );
    expect(ownershipBandTitle(1, { exact: 0, other: 0, borrowed: 0, locked: 1, missing: 0 })).toBe(
      "You own this card, but it's locked",
    );
    expect(ownershipBandTitle(2, { exact: 0, other: 0, borrowed: 0, locked: 2, missing: 0 })).toBe(
      "You own all 2, but they're locked",
    );
    expect(ownershipBandTitle(3, { exact: 0, other: 0, borrowed: 0, locked: 1, missing: 2 })).toBe(
      "You own 1 of 3, but it's locked",
    );
  });

  it("never says you own a borrowed copy", () => {
    expect(ownershipBandTitle(1, { exact: 0, other: 0, borrowed: 1, locked: 0, missing: 0 })).toBe(
      "You're borrowing this card",
    );
    expect(ownershipBandTitle(3, { exact: 0, other: 0, borrowed: 3, locked: 0, missing: 0 })).toBe(
      "You're borrowing all 3",
    );
    expect(ownershipBandTitle(3, { exact: 0, other: 0, borrowed: 2, locked: 0, missing: 1 })).toBe(
      "You're borrowing 2 of 3",
    );
  });

  // An entry needing nothing has borrowed === needed === 0, which must not
  // fall into the all-borrowed branch.
  it("doesn't claim a borrow for an entry that needs nothing", () => {
    expect(ownershipBandTitle(0, { exact: 0, other: 0, borrowed: 0, locked: 0, missing: 0 })).toBe(
      "You own all 0 in this printing",
    );
  });

  it("adds borrowed copies to an owned entry's sentence", () => {
    expect(ownershipBandTitle(3, { exact: 2, other: 0, borrowed: 1, locked: 0, missing: 0 })).toBe(
      "You own 2 of 3 in this printing, 1 is borrowed",
    );
    expect(ownershipBandTitle(4, { exact: 1, other: 1, borrowed: 2, locked: 0, missing: 0 })).toBe(
      "You own 1 of 4 in this printing and 1 in another, 2 are borrowed",
    );
    expect(ownershipBandTitle(4, { exact: 0, other: 1, borrowed: 1, locked: 1, missing: 1 })).toBe(
      "You own 1 of 4 in another printing, 1 is borrowed, 1 more is locked",
    );
  });
});
