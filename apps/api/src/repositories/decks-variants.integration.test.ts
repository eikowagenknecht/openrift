import type { Selectable } from "kysely";
import { afterAll, describe, expect, it } from "vitest";

import type { DecksTable } from "../db/index.js";
import {
  CARD_BODY_UNIT,
  CARD_CALM_UNIT,
  CARD_FURY_UNIT,
  PRINTING_1,
} from "../test/fixtures/constants.js";
import { createDbContext, seedTestUser } from "../test/integration-context.js";
import { deckPlansRepo } from "./deck-plans.js";
import { decksRepo } from "./decks.js";

// ---------------------------------------------------------------------------
// Integration tests: deck variants and checkpoints (ADR-042, migration 236).
//
// Uses the shared integration database. Requires INTEGRATION_DB_URL.
// Seeds its own users, collection, and decks; afterAll deletes the users,
// which cascades everything this file inserted.
// ---------------------------------------------------------------------------

const ctx = createDbContext(crypto.randomUUID());

const MISSING_DECK_ID = "00000000-0000-4000-a000-000000000000";

let userId: string;
let otherUserId: string;
let collectionId: string;

if (ctx) {
  const { db } = ctx;

  const user = await seedTestUser(db);
  const other = await seedTestUser(db);
  userId = user.id;
  otherUserId = other.id;

  const collection = await db
    .insertInto("collections")
    .values({
      userId,
      groupId: null,
      name: "DV Deck Box",
      description: null,
      isInbox: false,
      sortOrder: 0,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  collectionId = collection.id;

  afterAll(async () => {
    // decks, deck_cards, deck_plans, and collections all cascade from users.
    await db.deleteFrom("users").where("id", "in", [userId, otherUserId]).execute();
  });
}

describe.skipIf(!ctx)("decksRepo variants (ADR-042)", () => {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- guarded by skipIf
  const { db } = ctx!;
  const decks = decksRepo(db);
  const plans = deckPlansRepo(db);

  /** @returns A freshly created standalone deck owned by `owner` (the file's user by default). */
  async function makeDeck(
    name: string,
    opts?: { owner?: string },
  ): Promise<Selectable<DecksTable>> {
    return decks.create({
      userId: opts?.owner ?? userId,
      name,
      description: null,
      format: "constructed",
      formatConfig: null,
      isPublic: false,
    });
  }

  /**
   * Copies a deck and asserts the source was found, so the tests can read the
   * new row without threading `undefined` through every assertion.
   * @returns The new deck row.
   */
  async function copyOf(
    sourceId: string,
    input: { mode: "variant" | "checkpoint"; name?: string },
    owner = userId,
  ): Promise<Selectable<DecksTable>> {
    const copy = await decks.createVariantCopy(sourceId, owner, input);
    expect(copy).toBeDefined();
    return copy as Selectable<DecksTable>;
  }

  /** @returns The deck row read straight back from the database. */
  async function reload(id: string): Promise<Selectable<DecksTable>> {
    return db.selectFrom("decks").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  }

  /**
   * Links two decks and asserts the call succeeded, so the tests can read the
   * updated row without narrowing the result literal at every use.
   * @returns The re-read current deck row.
   */
  async function linkOf(
    id: string,
    input: { otherDeckId: string; markAsPreviousVersion?: boolean },
    owner = userId,
  ): Promise<Selectable<DecksTable>> {
    const result = await decks.linkAsVariant(id, owner, input);
    expect(result).not.toBe("not-found");
    expect(result).not.toBe("invalid");
    return result as Selectable<DecksTable>;
  }

  /**
   * Unlinks a deck and asserts the call succeeded.
   * @returns The re-read departing deck row.
   */
  async function unlinkOf(id: string, owner = userId): Promise<Selectable<DecksTable>> {
    const result = await decks.unlinkVariant(id, owner);
    expect(result).not.toBe("not-found");
    expect(result).not.toBe("no-family");
    return result as Selectable<DecksTable>;
  }

  /** @returns Every member of the given family, most recently updated first. */
  async function familyMembers(familyId: string | null): Promise<Selectable<DecksTable>[]> {
    if (familyId === null) {
      return [];
    }
    return db
      .selectFrom("decks")
      .selectAll()
      .where("familyId", "=", familyId)
      .orderBy("updatedAt", "desc")
      .execute();
  }

  // ── Family creation ───────────────────────────────────────────────────────

  describe("family creation", () => {
    it("creates the family on the first copy and makes the source primary", async () => {
      const source = await makeDeck("DV Family Source");
      expect(source.familyId).toBeNull();
      expect(source.isPrimary).toBe(false);

      const copy = await copyOf(source.id, { mode: "variant" });
      expect(copy.familyId).toBeTypeOf("string");

      const reloadedSource = await reload(source.id);
      expect(reloadedSource.familyId).toBe(copy.familyId);
      expect(reloadedSource.isPrimary).toBe(true);
      // The copy joins the family, but the source keeps fronting it.
      expect(copy.isPrimary).toBe(false);
    });

    it("reuses the existing family for later copies", async () => {
      const source = await makeDeck("DV Family Reuse");
      const first = await copyOf(source.id, { mode: "variant" });
      const second = await copyOf(source.id, { mode: "variant" });

      expect(second.familyId).toBe(first.familyId);
      const reloadedSource = await reload(source.id);
      expect(reloadedSource.isPrimary).toBe(true);
      const members = await db
        .selectFrom("decks")
        .select("id")
        .where("familyId", "=", first.familyId)
        .execute();
      expect(members).toHaveLength(3);
    });

    it("returns undefined for a missing deck and for another user's deck", async () => {
      const foreign = await makeDeck("DV Not Yours", { owner: otherUserId });
      const missing = await decks.createVariantCopy(MISSING_DECK_ID, userId, { mode: "variant" });
      expect(missing).toBeUndefined();
      const notMine = await decks.createVariantCopy(foreign.id, userId, { mode: "variant" });
      expect(notMine).toBeUndefined();

      // The foreign deck stayed standalone.
      const reloaded = await reload(foreign.id);
      expect(reloaded.familyId).toBeNull();
    });
  });

  // ── Lineage ───────────────────────────────────────────────────────────────

  describe("lineage", () => {
    it("points a variant at the deck it was copied from", async () => {
      const source = await makeDeck("DV Variant Pointer");
      const copy = await copyOf(source.id, { mode: "variant" });

      expect(copy.predecessorDeckId).toBe(source.id);
      // The live deck's own chain is untouched by a sibling variant.
      const reloadedSource = await reload(source.id);
      expect(reloadedSource.predecessorDeckId).toBeNull();
    });

    it("branches a variant off a checkpoint without touching the live deck", async () => {
      const source = await makeDeck("DV Branch Source");
      const checkpoint = await copyOf(source.id, { mode: "checkpoint" });
      const branch = await copyOf(checkpoint.id, { mode: "variant" });

      expect(branch.predecessorDeckId).toBe(checkpoint.id);
      expect(branch.familyId).toBe(checkpoint.familyId);
      const reloadedSource = await reload(source.id);
      expect(reloadedSource.predecessorDeckId).toBe(checkpoint.id);
    });

    it("slots each checkpoint behind the live deck, oldest last in the chain", async () => {
      const source = await makeDeck("DV Checkpoint Chain");
      const first = await copyOf(source.id, { mode: "checkpoint" });
      // The first checkpoint inherits the (empty) chain and becomes the source's
      // predecessor. The live deck keeps its id throughout.
      expect(first.predecessorDeckId).toBeNull();
      const afterFirst = await reload(source.id);
      expect(afterFirst.predecessorDeckId).toBe(first.id);

      const second = await copyOf(source.id, { mode: "checkpoint" });
      expect(second.predecessorDeckId).toBe(first.id);
      const afterSecond = await reload(source.id);
      expect(afterSecond.predecessorDeckId).toBe(second.id);
      expect(second.familyId).toBe(first.familyId);
    });
  });

  // ── What the copy carries ─────────────────────────────────────────────────

  describe("copied content", () => {
    it("copies deck cards with their zones, quantities, and preferred printings", async () => {
      const source = await makeDeck("DV Cards Source");
      await decks.replaceCards(source.id, [
        {
          cardId: CARD_FURY_UNIT.id,
          zone: "main",
          quantity: 3,
          preferredPrintingId: PRINTING_1.id,
        },
        { cardId: CARD_CALM_UNIT.id, zone: "sideboard", quantity: 2, preferredPrintingId: null },
      ]);

      const copy = await copyOf(source.id, { mode: "checkpoint" });
      const copied = await decks.cardsForDeck(copy.id, userId);
      expect(copied).toHaveLength(2);
      const fury = copied.find((card) => card.cardId === CARD_FURY_UNIT.id);
      expect(fury?.zone).toBe("main");
      expect(fury?.quantity).toBe(3);
      expect(fury?.preferredPrintingId).toBe(PRINTING_1.id);
      const calm = copied.find((card) => card.cardId === CARD_CALM_UNIT.id);
      expect(calm?.zone).toBe("sideboard");
      expect(calm?.quantity).toBe(2);
      expect(calm?.preferredPrintingId).toBeNull();

      // The source keeps its own rows: this is a copy, not a move.
      const sourceCards = await decks.cardsForDeck(source.id, userId);
      expect(sourceCards).toHaveLength(2);
    });

    it("copies the deck plan, its matchups, and their swaps", async () => {
      const source = await makeDeck("DV Plan Source");
      await plans.replaceForDeck(source.id, {
        generalStrategy: "Grind the mid game",
        mulliganSplit: true,
        mulliganGeneral: "",
        mulliganFirst: "Keep removal",
        mulliganSecond: "Keep threats",
        battlefieldG1CardId: CARD_BODY_UNIT.id,
        battlefieldFirstCardId: null,
        battlefieldSecondCardId: null,
        battlefieldCustom: false,
        battlefieldNote: "Take the wide board",
        matchups: [
          {
            opponentCardId: CARD_CALM_UNIT.id,
            opponentLabel: "Calm control",
            notes: "Race them",
            swaps: [
              { cardId: CARD_FURY_UNIT.id, direction: "in", quantity: 2 },
              { cardId: CARD_BODY_UNIT.id, direction: "out", quantity: 2 },
            ],
          },
          { opponentCardId: null, opponentLabel: "Aggro", notes: "", swaps: [] },
        ],
      });

      const copy = await copyOf(source.id, { mode: "checkpoint" });
      const copiedPlan = await plans.getForDeck(copy.id);
      expect(copiedPlan.plan?.generalStrategy).toBe("Grind the mid game");
      expect(copiedPlan.plan?.mulliganSplit).toBe(true);
      expect(copiedPlan.plan?.mulliganFirst).toBe("Keep removal");
      expect(copiedPlan.plan?.battlefieldG1CardId).toBe(CARD_BODY_UNIT.id);
      expect(copiedPlan.plan?.battlefieldNote).toBe("Take the wide board");

      expect(copiedPlan.matchups.map((matchup) => matchup.opponentLabel)).toEqual([
        "Calm control",
        "Aggro",
      ]);
      const [first] = copiedPlan.matchups;
      expect(first?.opponentCardId).toBe(CARD_CALM_UNIT.id);
      expect(first?.notes).toBe("Race them");
      expect(first?.swaps).toHaveLength(2);
      expect(first?.swaps.find((swap) => swap.direction === "in")?.cardId).toBe(CARD_FURY_UNIT.id);
      expect(first?.swaps.find((swap) => swap.direction === "out")?.quantity).toBe(2);

      // Rows were duplicated, not re-parented.
      const sourcePlan = await plans.getForDeck(source.id);
      expect(sourcePlan.plan).toBeDefined();
      expect(sourcePlan.matchups).toHaveLength(2);
      expect(sourcePlan.matchups[0]?.id).not.toBe(first?.id);
    });

    it("leaves the copy without a plan when the source has none", async () => {
      const source = await makeDeck("DV No Plan");
      const copy = await copyOf(source.id, { mode: "variant" });
      const copiedPlan = await plans.getForDeck(copy.id);
      expect(copiedPlan.plan).toBeUndefined();
      expect(copiedPlan.matchups).toEqual([]);
    });

    it("copies the deck's settings but never its shared state", async () => {
      const source = await makeDeck("DV Settings Source");
      await decks.update(source.id, userId, {
        description: "Budget build",
        format: "freeform",
        oddsConfig: {
          customGroups: [{ key: "removal", label: "Removal", types: ["spell"] }],
          selection: ["removal"],
        },
        coverCardId: CARD_FURY_UNIT.id,
        coverPrintingId: PRINTING_1.id,
        coverPosition: 40,
        collectionId,
        links: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Guide" }],
        isPinned: true,
      });
      await decks.setShareToken(source.id, userId, "dvsharetok01", true);

      const copy = await copyOf(source.id, { mode: "variant" });
      expect(copy.description).toBe("Budget build");
      expect(copy.format).toBe("freeform");
      expect(copy.oddsConfig?.selection).toEqual(["removal"]);
      expect(copy.oddsConfig?.customGroups[0]?.key).toBe("removal");
      expect(copy.coverCardId).toBe(CARD_FURY_UNIT.id);
      expect(copy.coverPrintingId).toBe(PRINTING_1.id);
      expect(copy.coverPosition).toBe(40);
      expect(copy.collectionId).toBe(collectionId);
      expect(copy.links).toEqual([
        { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Guide" },
      ]);

      // A copy is private and unpinned no matter what the source is.
      expect(copy.isPublic).toBe(false);
      expect(copy.shareToken).toBeNull();
      expect(copy.isPinned).toBe(false);
      expect(copy.isDraft).toBe(false);
      expect(copy.archivedAt).toBeNull();
    });

    it("copies the format config", async () => {
      const source = await makeDeck("DV Format Config");
      await decks.update(source.id, userId, {
        format: "constructed",
        formatConfig: { tagSlugs: ["bilgewater", "neutral"] },
      });

      const copy = await copyOf(source.id, { mode: "checkpoint" });
      expect(copy.formatConfig).toEqual({ tagSlugs: ["bilgewater", "neutral"] });
    });
  });

  // ── Names and wanted state ────────────────────────────────────────────────

  describe("naming and wanted state", () => {
    it("suffixes the source name per mode when no name is given", async () => {
      const source = await makeDeck("DV Named");
      const checkpoint = await copyOf(source.id, { mode: "checkpoint" });
      const variant = await copyOf(source.id, { mode: "variant" });

      expect(checkpoint.name).toBe("DV Named (checkpoint)");
      expect(variant.name).toBe("DV Named (variant)");
    });

    it("uses an explicit name verbatim", async () => {
      const source = await makeDeck("DV Explicit Name");
      const copy = await copyOf(source.id, { mode: "checkpoint", name: "Store event list" });
      expect(copy.name).toBe("Store event list");
    });
  });

  // ── promoteToPrimary ──────────────────────────────────────────────────────

  describe("promoteToPrimary", () => {
    it("moves the primary flag to the target and demotes the old primary", async () => {
      const source = await makeDeck("DV Promote Source");
      const copy = await copyOf(source.id, { mode: "variant" });
      const promoted = await decks.promoteToPrimary(copy.id, userId);

      expect(promoted).not.toBe("not-found");
      expect(promoted).not.toBe("no-family");
      expect(typeof promoted === "object" && promoted.isPrimary).toBe(true);
      const reloadedSource = await reload(source.id);
      expect(reloadedSource.isPrimary).toBe(false);
      const reloadedCopy = await reload(copy.id);
      expect(reloadedCopy.isPrimary).toBe(true);
    });

    it("keeps exactly one primary when the target already is the primary", async () => {
      const source = await makeDeck("DV Promote Primary");
      await copyOf(source.id, { mode: "variant" });
      const promoted = await decks.promoteToPrimary(source.id, userId);

      expect(typeof promoted === "object" && promoted.isPrimary).toBe(true);
      const { familyId } = await reload(source.id);
      expect(familyId).not.toBeNull();
      const primaries = await db
        .selectFrom("decks")
        .select("id")
        .where("familyId", "=", familyId)
        .where("isPrimary", "=", true)
        .execute();
      expect(primaries).toHaveLength(1);
    });

    it("reports no-family for a standalone deck", async () => {
      const standalone = await makeDeck("DV Promote Standalone");
      const result = await decks.promoteToPrimary(standalone.id, userId);
      expect(result).toBe("no-family");
    });

    it("reports not-found for a missing deck and for another user's deck", async () => {
      const foreign = await makeDeck("DV Promote Foreign", { owner: otherUserId });
      await copyOf(foreign.id, { mode: "variant" }, otherUserId);

      const missing = await decks.promoteToPrimary(MISSING_DECK_ID, userId);
      expect(missing).toBe("not-found");
      const notMine = await decks.promoteToPrimary(foreign.id, userId);
      expect(notMine).toBe("not-found");
      // The other user's family is untouched.
      const reloadedForeign = await reload(foreign.id);
      expect(reloadedForeign.isPrimary).toBe(true);
    });
  });

  // ── linkAsVariant ─────────────────────────────────────────────────────────

  describe("linkAsVariant", () => {
    it("gives two standalone decks a fresh family with this deck primary", async () => {
      const current = await makeDeck("DV Link Fresh Current");
      const other = await makeDeck("DV Link Fresh Other");

      const linked = await linkOf(current.id, { otherDeckId: other.id });
      expect(linked.familyId).toBeTypeOf("string");
      expect(linked.isPrimary).toBe(true);
      // Linking alone says nothing about lineage.
      expect(linked.predecessorDeckId).toBeNull();

      const reloadedOther = await reload(other.id);
      expect(reloadedOther.familyId).toBe(linked.familyId);
      expect(reloadedOther.isPrimary).toBe(false);
    });

    it("joins the other deck's family and leaves its primary in place", async () => {
      const source = await makeDeck("DV Link Join Source");
      const sibling = await copyOf(source.id, { mode: "variant" });
      const standalone = await makeDeck("DV Link Join Standalone");

      const linked = await linkOf(standalone.id, { otherDeckId: sibling.id });
      expect(linked.familyId).toBe(sibling.familyId);
      expect(linked.isPrimary).toBe(false);
      const reloadedSource = await reload(source.id);
      expect(reloadedSource.isPrimary).toBe(true);
    });

    it("pulls a standalone deck into this deck's family", async () => {
      const source = await makeDeck("DV Link Absorb Source");
      const sibling = await copyOf(source.id, { mode: "variant" });
      const standalone = await makeDeck("DV Link Absorb Standalone");

      const linked = await linkOf(source.id, { otherDeckId: standalone.id });
      expect(linked.familyId).toBe(sibling.familyId);
      expect(linked.isPrimary).toBe(true);
      const reloadedStandalone = await reload(standalone.id);
      expect(reloadedStandalone.familyId).toBe(linked.familyId);
      expect(reloadedStandalone.isPrimary).toBe(false);
    });

    it("merges two families, moving every member and keeping one primary", async () => {
      const leftSource = await makeDeck("DV Merge Left");
      const leftSibling = await copyOf(leftSource.id, { mode: "variant" });
      const rightSource = await makeDeck("DV Merge Right");
      const rightSibling = await copyOf(rightSource.id, { mode: "variant" });

      const linked = await linkOf(leftSource.id, { otherDeckId: rightSource.id });
      expect(linked.familyId).toBe(leftSibling.familyId);
      expect(linked.isPrimary).toBe(true);

      const members = await familyMembers(linked.familyId);
      expect(members.map((member) => member.id).toSorted()).toEqual(
        [leftSource.id, leftSibling.id, rightSource.id, rightSibling.id].toSorted(),
      );
      expect(members.filter((member) => member.isPrimary)).toHaveLength(1);
      // The absorbed family's primary steps down, and its id is left empty.
      const reloadedRightSource = await reload(rightSource.id);
      expect(reloadedRightSource.isPrimary).toBe(false);
      expect(await familyMembers(rightSibling.familyId)).toHaveLength(0);
    });

    it("records the other deck as this deck's previous version when asked", async () => {
      const current = await makeDeck("DV Link Previous Newer");
      const other = await makeDeck("DV Link Previous Older");

      const linked = await linkOf(current.id, {
        otherDeckId: other.id,
        markAsPreviousVersion: true,
      });
      expect(linked.predecessorDeckId).toBe(other.id);
      // Only this deck's chain moves; the other keeps its own.
      const reloadedOther = await reload(other.id);
      expect(reloadedOther.predecessorDeckId).toBeNull();
    });

    it("ignores the previous-version flag when this deck already has one", async () => {
      const source = await makeDeck("DV Link Previous Kept");
      const checkpoint = await copyOf(source.id, { mode: "checkpoint" });
      const other = await makeDeck("DV Link Previous Ignored");

      const linked = await linkOf(source.id, {
        otherDeckId: other.id,
        markAsPreviousVersion: true,
      });
      expect(linked.predecessorDeckId).toBe(checkpoint.id);
    });

    it("reports invalid for a deck linked to itself", async () => {
      const deck = await makeDeck("DV Link Self");
      const result = await decks.linkAsVariant(deck.id, userId, { otherDeckId: deck.id });
      expect(result).toBe("invalid");
    });

    it("reports invalid for two decks that already share a family", async () => {
      const source = await makeDeck("DV Link Same Family");
      const sibling = await copyOf(source.id, { mode: "variant" });
      const result = await decks.linkAsVariant(source.id, userId, { otherDeckId: sibling.id });
      expect(result).toBe("invalid");
    });

    it("reports not-found for a missing deck and for another user's deck", async () => {
      const mine = await makeDeck("DV Link Mine");
      const foreign = await makeDeck("DV Link Foreign", { owner: otherUserId });

      const missingCurrent = await decks.linkAsVariant(MISSING_DECK_ID, userId, {
        otherDeckId: mine.id,
      });
      expect(missingCurrent).toBe("not-found");
      const missingOther = await decks.linkAsVariant(mine.id, userId, {
        otherDeckId: MISSING_DECK_ID,
      });
      expect(missingOther).toBe("not-found");
      const notMine = await decks.linkAsVariant(mine.id, userId, { otherDeckId: foreign.id });
      expect(notMine).toBe("not-found");

      // Neither side was touched by the failed attempts.
      const reloadedMine = await reload(mine.id);
      expect(reloadedMine.familyId).toBeNull();
      const reloadedForeign = await reload(foreign.id);
      expect(reloadedForeign.familyId).toBeNull();
    });
  });

  // ── unlinkVariant ─────────────────────────────────────────────────────────

  describe("unlinkVariant", () => {
    it("closes the predecessor chain over the departing deck", async () => {
      // Two checkpoints stack up as live -> newer -> older.
      const live = await makeDeck("DV Unlink Chain");
      const older = await copyOf(live.id, { mode: "checkpoint" });
      const newer = await copyOf(live.id, { mode: "checkpoint" });
      expect(newer.predecessorDeckId).toBe(older.id);

      const departed = await unlinkOf(newer.id);
      expect(departed.familyId).toBeNull();
      expect(departed.isPrimary).toBe(false);
      expect(departed.predecessorDeckId).toBeNull();

      const reloadedLive = await reload(live.id);
      expect(reloadedLive.predecessorDeckId).toBe(older.id);
      expect(reloadedLive.isPrimary).toBe(true);
    });

    it("promotes the most recently updated survivor when the primary leaves", async () => {
      const source = await makeDeck("DV Unlink Primary");
      const older = await copyOf(source.id, { mode: "variant" });
      const newer = await copyOf(source.id, { mode: "variant" });
      // Pin the recency order explicitly: the update trigger stamps now().
      await decks.update(older.id, userId, { name: "DV Unlink Primary (older)" });
      await decks.update(newer.id, userId, { name: "DV Unlink Primary (newer)" });

      const departed = await unlinkOf(source.id);
      expect(departed.familyId).toBeNull();
      expect(departed.isPrimary).toBe(false);

      const reloadedNewer = await reload(newer.id);
      const reloadedOlder = await reload(older.id);
      expect(reloadedNewer.isPrimary).toBe(true);
      expect(reloadedOlder.isPrimary).toBe(false);
      // Both descended from the departing deck, which itself had no predecessor.
      expect(reloadedNewer.predecessorDeckId).toBeNull();
      expect(reloadedOlder.predecessorDeckId).toBeNull();
    });

    it("turns the last survivor back into a standalone deck", async () => {
      const source = await makeDeck("DV Unlink To One");
      const checkpoint = await copyOf(source.id, { mode: "checkpoint" });
      const beforeUnlink = await reload(source.id);
      expect(beforeUnlink.predecessorDeckId).toBe(checkpoint.id);

      await unlinkOf(checkpoint.id);

      const survivor = await reload(source.id);
      expect(survivor.familyId).toBeNull();
      expect(survivor.isPrimary).toBe(false);
      expect(survivor.predecessorDeckId).toBeNull();
    });

    it("reports no-family for a standalone deck", async () => {
      const standalone = await makeDeck("DV Unlink Standalone");
      const result = await decks.unlinkVariant(standalone.id, userId);
      expect(result).toBe("no-family");
    });

    it("reports not-found for a missing deck and for another user's deck", async () => {
      const foreign = await makeDeck("DV Unlink Foreign", { owner: otherUserId });
      await copyOf(foreign.id, { mode: "variant" }, otherUserId);

      const missing = await decks.unlinkVariant(MISSING_DECK_ID, userId);
      expect(missing).toBe("not-found");
      const notMine = await decks.unlinkVariant(foreign.id, userId);
      expect(notMine).toBe("not-found");
      // The other user's family is untouched.
      const reloadedForeign = await reload(foreign.id);
      expect(reloadedForeign.familyId).not.toBeNull();
      expect(reloadedForeign.isPrimary).toBe(true);
    });
  });

  // ── Deletion repairs the family ───────────────────────────────────────────

  describe("deleteByIdForUser family repair", () => {
    it("promotes the most recently updated survivor when the primary is deleted", async () => {
      const source = await makeDeck("DV Delete Primary");
      const older = await copyOf(source.id, { mode: "variant" });
      const newer = await copyOf(source.id, { mode: "variant" });
      // Pin the recency order explicitly: the update trigger stamps now().
      await decks.update(older.id, userId, { name: "DV Delete Primary (older)" });
      await decks.update(newer.id, userId, { name: "DV Delete Primary (newer)" });

      const result = await decks.deleteByIdForUser(source.id, userId);
      expect(result.numDeletedRows).toBe(1n);

      const reloadedNewer = await reload(newer.id);
      const reloadedOlder = await reload(older.id);
      expect(reloadedNewer.isPrimary).toBe(true);
      expect(reloadedOlder.isPrimary).toBe(false);
      // Predecessor pointers at the deleted deck detach rather than cascade.
      expect(reloadedNewer.predecessorDeckId).toBeNull();
      expect(reloadedOlder.predecessorDeckId).toBeNull();
    });

    it("leaves the primary alone when a non-primary member is deleted", async () => {
      const source = await makeDeck("DV Delete Sibling");
      const first = await copyOf(source.id, { mode: "variant" });
      const second = await copyOf(source.id, { mode: "variant" });

      await decks.deleteByIdForUser(second.id, userId);

      const reloadedSource = await reload(source.id);
      expect(reloadedSource.isPrimary).toBe(true);
      expect(reloadedSource.familyId).not.toBeNull();
      const reloadedFirst = await reload(first.id);
      expect(reloadedFirst.familyId).toBe(reloadedSource.familyId);
    });

    it("turns the last survivor back into a standalone deck", async () => {
      const source = await makeDeck("DV Delete To One");
      const checkpoint = await copyOf(source.id, { mode: "checkpoint" });
      const beforeDelete = await reload(source.id);
      expect(beforeDelete.predecessorDeckId).toBe(checkpoint.id);

      await decks.deleteByIdForUser(checkpoint.id, userId);

      const survivor = await reload(source.id);
      expect(survivor.familyId).toBeNull();
      expect(survivor.isPrimary).toBe(false);
      expect(survivor.predecessorDeckId).toBeNull();
    });

    it("still deletes a standalone deck and reports a miss for someone else's", async () => {
      const standalone = await makeDeck("DV Delete Standalone");
      const first = await decks.deleteByIdForUser(standalone.id, userId);
      expect(first.numDeletedRows).toBe(1n);
      const second = await decks.deleteByIdForUser(standalone.id, userId);
      expect(second.numDeletedRows).toBe(0n);

      const foreign = await makeDeck("DV Delete Foreign", { owner: otherUserId });
      const foreignDelete = await decks.deleteByIdForUser(foreign.id, userId);
      expect(foreignDelete.numDeletedRows).toBe(0n);
      const survivor = await reload(foreign.id);
      expect(survivor.id).toBe(foreign.id);
    });
  });
});
