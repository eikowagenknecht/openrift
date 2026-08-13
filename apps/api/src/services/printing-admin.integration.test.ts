import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRepos, createTransact } from "../deps.js";
import type { Io } from "../io.js";
import { createDbContext, syncCardCardTypes } from "../test/integration-context.js";
import { acceptPrinting, updatePrintingMarkers } from "./printing-admin.js";

// ---------------------------------------------------------------------------
// Regression: editing one sibling printing's markers must not trip the
// `uq_printings_identity` constraint even when another printing already has
// the empty `marker_slugs = {}` state that the DELETE phase passes through.
// Fix relies on (a) deferrable uniqueness constraints (migration 092) and
// (b) `updatePrintingMarkers` running DELETE + INSERT inside one transaction.
// ---------------------------------------------------------------------------

const USER_ID = "a0000000-0042-4000-a000-000000000001";
const ctx = createDbContext(USER_ID);

describe.skipIf(!ctx)("updatePrintingMarkers (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const transact = createTransact(db);

  const SET_SLUG = "PADM-TEST";
  const CARD_SLUG = "PADM-001";
  const SHORT_CODE = "PADM-001";

  let setId = "";
  let cardId = "";
  let printingEmptyId = "";
  let printingWithMarkerId = "";

  beforeAll(async () => {
    // The test transitions markers [promo] → [nexus, promo] to force the join
    // table through an empty state. `promo` is globally seeded; `nexus` is not,
    // so seed it here for this test to reference.
    await db
      .insertInto("markers")
      .values({ slug: "nexus", label: "Nexus", description: null, sortOrder: 100 })
      .onConflict((oc) => oc.column("slug").doNothing())
      .execute();

    const [setRow] = await db
      .insertInto("sets")
      .values({
        slug: SET_SLUG,
        name: "Printing Admin Test Set",
        printedTotal: 1,
        sortOrder: 951,
      })
      .returning("id")
      .execute();
    setId = setRow.id;

    const [cardRow] = await db
      .insertInto("cards")
      .values({
        slug: CARD_SLUG,
        name: "Printing Admin Test Card",
        type: "unit",
        might: null,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();
    cardId = cardRow.id;
    await syncCardCardTypes(db);

    await db.insertInto("cardDomains").values({ cardId, domainSlug: "fury", ordinal: 0 }).execute();

    // Printing A: empty marker_slugs (the sibling that causes the collision).
    const [emptyRow] = await db
      .insertInto("printings")
      .values({
        cardId,
        setId,
        shortCode: SHORT_CODE,
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "foil",
        artist: "Test",
        publicCode: SHORT_CODE,
        language: "EN",
        size: "standard",
      })
      .returning("id")
      .execute();
    printingEmptyId = emptyRow.id;

    // Printing B: same identity columns as A but distinguished by a marker.
    // Insert with default empty markers first, then attach a marker row —
    // the sync trigger repopulates marker_slugs to ['promo'], making B
    // distinct from A under `uq_printings_identity`.
    const [markerRow] = await db
      .insertInto("printings")
      .values({
        cardId,
        setId,
        shortCode: SHORT_CODE,
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "foil",
        artist: "Test",
        publicCode: SHORT_CODE,
        language: "EN",
        // Set directly; no sibling row with ['promo'] exists yet so no clash.
        markerSlugs: ["promo"],
        size: "standard",
      })
      .returning("id")
      .execute();
    printingWithMarkerId = markerRow.id;

    const promoMarker = await db
      .selectFrom("markers")
      .select("id")
      .where("slug", "=", "promo")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("printingMarkers")
      .values({ printingId: printingWithMarkerId, markerId: promoMarker.id })
      .execute();
  });

  afterAll(async () => {
    await db
      .deleteFrom("printings")
      .where("id", "in", [printingEmptyId, printingWithMarkerId])
      .execute();
    await db.deleteFrom("cards").where("id", "=", cardId).execute();
    await db.deleteFrom("sets").where("id", "=", setId).execute();
  });

  it("replaces markers even when a sibling printing has empty marker_slugs", async () => {
    // Transitioning from [promo] to [nexus, promo] forces the join table
    // through an empty state inside the transaction. Without deferrable
    // `uq_printings_identity`, the per-statement check sees the intermediate
    // `marker_slugs = {}` and collides with the empty-marker sibling.
    await expect(
      updatePrintingMarkers(transact, printingWithMarkerId, ["nexus", "promo"]),
    ).resolves.toBeUndefined();

    const updated = await db
      .selectFrom("printings")
      .select("markerSlugs")
      .where("id", "=", printingWithMarkerId)
      .executeTakeFirstOrThrow();
    expect(updated.markerSlugs).toEqual(["nexus", "promo"]);

    const untouched = await db
      .selectFrom("printings")
      .select("markerSlugs")
      .where("id", "=", printingEmptyId)
      .executeTakeFirstOrThrow();
    expect(untouched.markerSlugs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Regression: the admin "create printing" flow (and the duplicate-a-printing
// shortcut behind it) went through the same upsert as the ingest paths, so
// submitting an unchanged duplicate overwrote the source printing and reported
// success. `requireNew` makes that identity collision a 409 instead.
// ---------------------------------------------------------------------------

describe.skipIf(!ctx)("acceptPrinting requireNew (integration)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const transact = createTransact(db);
  const io = {} as Io;

  const SET_SLUG = "PADM2-TEST";
  const CARD_SLUG = "PADM2-001";
  const SHORT_CODE = "PADM2-001";

  const repos = createRepos(db);
  // Deliberately without `printingEvents`: the new-printing feed is not what
  // this test is about, and leaving it out keeps teardown to the rows below.
  const acceptRepos = {
    catalogMutations: repos.catalogMutations,
    printingImages: repos.printingImages,
    markers: repos.markers,
    distributionChannels: repos.distributionChannels,
  };

  const fields = {
    shortCode: SHORT_CODE,
    setId: SET_SLUG,
    setName: "Printing Admin Require-New Set",
    rarity: "common",
    artist: "Original Artist",
    publicCode: SHORT_CODE,
  };

  let setId = "";
  let cardId = "";
  let printingId = "";

  beforeAll(async () => {
    const [setRow] = await db
      .insertInto("sets")
      .values({
        slug: SET_SLUG,
        name: "Printing Admin Require-New Set",
        printedTotal: 1,
        sortOrder: 952,
      })
      .returning("id")
      .execute();
    setId = setRow.id;

    const [cardRow] = await db
      .insertInto("cards")
      .values({
        slug: CARD_SLUG,
        name: "Printing Admin Require-New Card",
        type: "unit",
        might: null,
        energy: 1,
        power: null,
        mightBonus: null,
        keywords: [],
        tags: [],
      })
      .returning("id")
      .execute();
    cardId = cardRow.id;
    await syncCardCardTypes(db);

    await db.insertInto("cardDomains").values({ cardId, domainSlug: "fury", ordinal: 0 }).execute();

    const [printingRow] = await db
      .insertInto("printings")
      .values({
        cardId,
        setId,
        shortCode: SHORT_CODE,
        rarity: "common",
        artVariant: "normal",
        isSigned: false,
        finish: "normal",
        artist: "Original Artist",
        publicCode: `${SHORT_CODE}/1`,
        language: "EN",
        size: "standard",
      })
      .returning("id")
      .execute();
    printingId = printingRow.id;
  });

  afterAll(async () => {
    await db.deleteFrom("printings").where("cardId", "=", cardId).execute();
    await db.deleteFrom("cards").where("id", "=", cardId).execute();
    await db.deleteFrom("sets").where("id", "=", setId).execute();
  });

  it("rejects a duplicate of an existing printing instead of overwriting it", async () => {
    await expect(
      acceptPrinting(
        transact,
        acceptRepos,
        cardId,
        { ...fields, artist: "Overwriting Artist" },
        [],
        io,
        {
          requireNew: true,
        },
      ),
    ).rejects.toThrow(`This card already has a printing with short code "${SHORT_CODE}"`);

    const unchanged = await db
      .selectFrom("printings")
      .select("artist")
      .where("id", "=", printingId)
      .executeTakeFirstOrThrow();
    expect(unchanged.artist).toBe("Original Artist");
  });

  it("allows a duplicate that differs in a field the identity covers", async () => {
    const newId = await acceptPrinting(
      transact,
      acceptRepos,
      cardId,
      { ...fields, finish: "foil" },
      [],
      io,
      { requireNew: true },
    );

    expect(newId).not.toBe(printingId);
    const created = await db
      .selectFrom("printings")
      .select("finish")
      .where("id", "=", newId)
      .executeTakeFirstOrThrow();
    expect(created.finish).toBe("foil");
  });

  it("still upserts without requireNew so ingest re-runs stay idempotent", async () => {
    const sameId = await acceptPrinting(
      transact,
      acceptRepos,
      cardId,
      { ...fields, artist: "Ingest Artist" },
      [],
      io,
    );

    expect(sameId).toBe(printingId);
    const updated = await db
      .selectFrom("printings")
      .select("artist")
      .where("id", "=", printingId)
      .executeTakeFirstOrThrow();
    expect(updated.artist).toBe("Ingest Artist");
  });
});
