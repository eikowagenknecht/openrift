import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { DecksTable } from "../../../db/tables/decks.js";
import { createsCycle } from "./deck-lineage.js";
import { lockFamilies } from "./decks-shared.js";

export function decksFamiliesRepo(db: Kysely<Database>) {
  return {
    /**
     * Copies a deck into its variant family, creating the family on first use
     * (the source becomes primary). The copy is an editable sibling descending
     * from the source. Unlike `cloneDeck` this also copies the odds config,
     * cover, and the full deck plan.
     */
    createVariantCopy(
      id: string,
      userId: string,
      input: { name?: string },
    ): Promise<Selectable<DecksTable> | undefined> {
      return db.transaction().execute(async (trx) => {
        const source = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!source) {
          return;
        }

        let familyId = source.familyId;
        if (familyId === null) {
          familyId = crypto.randomUUID();
          await trx
            .updateTable("decks")
            .set({ familyId, isPrimary: true })
            .where("id", "=", id)
            .execute();
        }

        const copy = await trx
          .insertInto("decks")
          .values({
            userId,
            name: input.name ?? `${source.name} (variant)`,
            description: source.description,
            links: source.links,
            format: source.format,
            formatConfig: source.formatConfig,
            oddsConfig: source.oddsConfig,
            coverCardId: source.coverCardId,
            coverPrintingId: source.coverPrintingId,
            coverPosition: source.coverPosition,
            // No home collection: a variant is a deck of its own, and every
            // deck stored in a box reserves that box's copies against the
            // others there. Inheriting the source's box would have the copy
            // hold cards nobody decided to store with it.
            isPublic: false,
            familyId,
            predecessorDeckId: source.id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        const sourceCards = await trx
          .selectFrom("deckCards")
          .select(["cardId", "zone", "quantity", "preferredPrintingId"])
          .where("deckId", "=", id)
          .execute();
        if (sourceCards.length > 0) {
          await trx
            .insertInto("deckCards")
            .values(sourceCards.map((card) => ({ deckId: copy.id, ...card })))
            .execute();
        }

        const plan = await trx
          .selectFrom("deckPlans")
          .selectAll()
          .where("deckId", "=", id)
          .executeTakeFirst();
        if (plan) {
          await trx
            .insertInto("deckPlans")
            .values({
              deckId: copy.id,
              generalStrategy: plan.generalStrategy,
              mulliganSplit: plan.mulliganSplit,
              mulliganGeneral: plan.mulliganGeneral,
              mulliganFirst: plan.mulliganFirst,
              mulliganSecond: plan.mulliganSecond,
              battlefieldG1CardId: plan.battlefieldG1CardId,
              battlefieldFirstCardId: plan.battlefieldFirstCardId,
              battlefieldSecondCardId: plan.battlefieldSecondCardId,
              battlefieldCustom: plan.battlefieldCustom,
              battlefieldNote: plan.battlefieldNote,
            })
            .execute();
        }

        const matchups = await trx
          .selectFrom("deckMatchupPlans")
          .selectAll()
          .where("deckId", "=", id)
          .orderBy("sortOrder")
          .execute();
        for (const matchup of matchups) {
          const newMatchup = await trx
            .insertInto("deckMatchupPlans")
            .values({
              deckId: copy.id,
              opponentCardId: matchup.opponentCardId,
              opponentLabel: matchup.opponentLabel,
              notes: matchup.notes,
              sortOrder: matchup.sortOrder,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
          const swaps = await trx
            .selectFrom("deckMatchupSwaps")
            .select(["cardId", "direction", "quantity"])
            .where("planId", "=", matchup.id)
            .execute();
          if (swaps.length > 0) {
            await trx
              .insertInto("deckMatchupSwaps")
              .values(swaps.map((swap) => ({ planId: newMatchup.id, ...swap })))
              .execute();
          }
        }

        return copy;
      });
    },

    /**
     * Links two existing decks into one variant family. Both decks
     * must be owned by `userId`. Each side brings its whole family along, so
     * linking a member of family A to a member of family B merges A and B. The
     * merged family keeps the surviving family's primary, falling back to the
     * absorbed family's and finally to the deck being linked from.
     * `markAsPreviousVersion` also records the other deck as this deck's
     * predecessor, and is ignored when this deck already has one.
     */
    linkAsVariant(
      id: string,
      userId: string,
      input: { otherDeckId: string; markAsPreviousVersion?: boolean },
    ): Promise<Selectable<DecksTable> | "not-found" | "invalid"> {
      return db.transaction().execute(async (trx) => {
        if (id === input.otherDeckId) {
          return "invalid" as const;
        }
        const rows = await trx
          .selectFrom("decks")
          .select(["id", "familyId", "isPrimary", "predecessorDeckId"])
          .where("id", "in", [id, input.otherDeckId])
          .where("userId", "=", userId)
          .forUpdate()
          .execute();
        const current = rows.find((row) => row.id === id);
        const other = rows.find((row) => row.id === input.otherDeckId);
        if (!current || !other) {
          return "not-found" as const;
        }
        if (current.familyId !== null && current.familyId === other.familyId) {
          return "invalid" as const;
        }

        const familyId = current.familyId ?? other.familyId ?? crypto.randomUUID();
        const absorbedFamilyIds = [current.familyId, other.familyId].filter(
          (candidate): candidate is string => candidate !== null && candidate !== familyId,
        );
        const standaloneIds = rows.filter((row) => row.familyId === null).map((row) => row.id);

        // Lock every member of the families being merged before reading their
        // primaries — see lockFamilies.
        await lockFamilies(trx, userId, [familyId, ...absorbedFamilyIds]);
        const primaries = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("familyId", "in", [familyId, ...absorbedFamilyIds])
          .where("userId", "=", userId)
          .where("isPrimary", "=", true)
          .execute();
        const keeperId =
          primaries.find((row) => row.familyId === familyId)?.id ?? primaries[0]?.id ?? id;

        // Demote before moving: `uq_decks_family_primary` rejects a second
        // primary the moment the absorbed rows land in the surviving family.
        const demoteIds = [...primaries.map((row) => row.id), ...standaloneIds];
        if (demoteIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ isPrimary: false })
            .where("id", "in", demoteIds)
            .execute();
        }
        if (absorbedFamilyIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ familyId })
            .where("familyId", "in", absorbedFamilyIds)
            .where("userId", "=", userId)
            .execute();
        }
        if (standaloneIds.length > 0) {
          await trx
            .updateTable("decks")
            .set({ familyId })
            .where("id", "in", standaloneIds)
            .execute();
        }
        await trx
          .updateTable("decks")
          .set({ isPrimary: true })
          .where("id", "=", keeperId)
          .execute();

        if (input.markAsPreviousVersion && current.predecessorDeckId === null) {
          await trx
            .updateTable("decks")
            .set({ predecessorDeckId: other.id })
            .where("id", "=", id)
            .execute();
        }

        const row = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    /**
     * Removes a deck from its variant family, turning it back into a
     * standalone deck. Members that descended from it inherit its own
     * predecessor, so the chain closes over the gap. The family is then
     * repaired exactly as a deletion repairs it: a sole survivor reverts to
     * standalone, and a departing primary hands the flag to the most recently
     * updated survivor.
     */
    unlinkVariant(
      id: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | "not-found" | "no-family"> {
      return db.transaction().execute(async (trx) => {
        const departing = await trx
          .selectFrom("decks")
          .select(["id", "familyId", "isPrimary", "predecessorDeckId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!departing) {
          return "not-found" as const;
        }
        if (!departing.familyId) {
          return "no-family" as const;
        }
        // The departing row is already locked above; lock the rest of the
        // family before reading survivors.
        await lockFamilies(trx, userId, [departing.familyId]);

        // Read survivor order before the splice below writes: the updated_at
        // trigger stamps every touched row with the same timestamp.
        const survivors = await trx
          .selectFrom("decks")
          .select(["id", "isPrimary"])
          .where("familyId", "=", departing.familyId)
          .where("userId", "=", userId)
          .where("id", "!=", id)
          .orderBy("updatedAt", "desc")
          .execute();

        // Splice the chain: B -> A -> C becomes B -> C when A leaves.
        await trx
          .updateTable("decks")
          .set({ predecessorDeckId: departing.predecessorDeckId })
          .where("familyId", "=", departing.familyId)
          .where("userId", "=", userId)
          .where("predecessorDeckId", "=", id)
          .execute();

        // Clearing the departing row first frees the family's primary slot, so
        // promoting a survivor below can't trip `uq_decks_family_primary`.
        await trx
          .updateTable("decks")
          .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
          .where("id", "=", id)
          .execute();

        const [newest] = survivors;
        if (newest && survivors.length === 1) {
          // A family of one is no family.
          await trx
            .updateTable("decks")
            .set({ familyId: null, isPrimary: false, predecessorDeckId: null })
            .where("id", "=", newest.id)
            .execute();
        } else if (newest && departing.isPrimary) {
          await trx
            .updateTable("decks")
            .set({ isPrimary: true })
            .where("id", "=", newest.id)
            .execute();
        }

        const row = await trx
          .selectFrom("decks")
          .selectAll()
          .where("id", "=", id)
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    setPredecessor(
      id: string,
      userId: string,
      predecessorDeckId: string | null,
    ): Promise<Selectable<DecksTable> | "not-found" | "invalid"> {
      return db.transaction().execute(async (trx) => {
        if (id === predecessorDeckId) {
          return "invalid" as const;
        }
        const target = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return "not-found" as const;
        }
        if (predecessorDeckId !== null) {
          if (target.familyId === null) {
            return "invalid" as const;
          }
          const parent = await trx
            .selectFrom("decks")
            .select(["id", "familyId"])
            .where("id", "=", predecessorDeckId)
            .where("userId", "=", userId)
            .executeTakeFirst();
          if (!parent) {
            return "not-found" as const;
          }
          if (parent.familyId !== target.familyId) {
            return "invalid" as const;
          }
          const family = await trx
            .selectFrom("decks")
            .select(["id", "predecessorDeckId"])
            .where("familyId", "=", target.familyId)
            .where("userId", "=", userId)
            .execute();
          if (createsCycle(family, id, predecessorDeckId)) {
            return "invalid" as const;
          }
        }
        const row = await trx
          .updateTable("decks")
          .set({ predecessorDeckId })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return row;
      });
    },

    /**
     * Demotes the current primary in the same transaction. The partial unique
     * index `uq_decks_family_primary` backstops the one-primary invariant.
     */
    promoteToPrimary(
      id: string,
      userId: string,
    ): Promise<Selectable<DecksTable> | "not-found" | "no-family"> {
      return db.transaction().execute(async (trx) => {
        const target = await trx
          .selectFrom("decks")
          .select(["id", "familyId"])
          .where("id", "=", id)
          .where("userId", "=", userId)
          .forUpdate()
          .executeTakeFirst();
        if (!target) {
          return "not-found" as const;
        }
        if (!target.familyId) {
          return "no-family" as const;
        }
        await trx
          .updateTable("decks")
          .set({ isPrimary: false })
          .where("familyId", "=", target.familyId)
          .where("userId", "=", userId)
          .where("isPrimary", "=", true)
          .where("id", "!=", id)
          .execute();
        const row = await trx
          .updateTable("decks")
          .set({ isPrimary: true })
          .where("id", "=", id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return row;
      });
    },
  };
}
