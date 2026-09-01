import { WellKnown } from "@openrift/shared";
import type { TokenCardName } from "@openrift/shared/card-tokens";
import { findTokenReferences } from "@openrift/shared/card-tokens";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
import { rowBatches } from "../lib/bind-batches.js";

interface TokenTextSources {
  errata: { correctedRulesText: string | null; correctedEffectText: string | null } | undefined;
  printings: { printedRulesText: string | null; printedEffectText: string | null }[];
}

function textsOf({ errata, printings }: TokenTextSources): (string | null)[] {
  return [
    errata?.correctedRulesText ?? null,
    errata?.correctedEffectText ?? null,
    ...printings.flatMap((printing) => [printing.printedRulesText, printing.printedEffectText]),
  ];
}

/**
 * Replace the derived rows for one card. Manual rows are left alone, and a
 * derived row that duplicates a manual one is dropped rather than conflicting.
 */
async function writeDerived(
  trx: Kysely<Database>,
  cardId: string,
  tokenCardIds: string[],
): Promise<void> {
  await trx
    .deleteFrom("cardTokens")
    .where("cardId", "=", cardId)
    .where("source", "=", "derived")
    .execute();

  if (tokenCardIds.length === 0) {
    return;
  }

  await trx
    .insertInto("cardTokens")
    .values(
      tokenCardIds.map((tokenCardId) => ({ cardId, tokenCardId, source: "derived" as const })),
    )
    .onConflict((oc) => oc.columns(["cardId", "tokenCardId"]).doNothing())
    .execute();
}

/**
 * Reads and derivation for `card_tokens`: which token cards a card tells the
 * player to create.
 *
 * The derivation only ever reads EN text, because the phrasing it matches is
 * English (`findTokenReferences`). What it stores is a card-id pair, so the
 * result is language-neutral and every language renders the token through its
 * own printings.
 *
 * Callers must refresh `mv_card_aggregates` afterwards, since that view is what
 * the catalog reads.
 */
export function cardTokensRepo(db: Kysely<Database>) {
  async function tokenCards(): Promise<TokenCardName[]> {
    const rows = await db
      .selectFrom("cards")
      .innerJoin("cardSuperTypes as cst", "cst.cardId", "cards.id")
      .select(["cards.id as cardId", "cards.name"])
      .where("cst.superTypeSlug", "=", WellKnown.superType.TOKEN)
      .orderBy("cards.name")
      .execute();
    return rows;
  }

  /** Every card-type slug, used to validate the word before "token". */
  async function cardTypeSlugs(): Promise<string[]> {
    const rows = await db.selectFrom("cardTypes").select("slug").execute();
    return rows.map((row) => row.slug);
  }

  async function recomputeForCard(cardId: string): Promise<void> {
    const [tokens, typeSlugs] = await Promise.all([tokenCards(), cardTypeSlugs()]);

    const errata = await db
      .selectFrom("cardErrata")
      .select(["correctedRulesText", "correctedEffectText"])
      .where("cardId", "=", cardId)
      .executeTakeFirst();

    const printings = await db
      .selectFrom("printings")
      .select(["printedRulesText", "printedEffectText"])
      .where("cardId", "=", cardId)
      .where("language", "=", WellKnown.language.EN)
      .execute();

    const tokenCardIds = findTokenReferences(
      textsOf({ errata, printings }),
      tokens,
      typeSlugs,
      cardId,
    );

    // No transaction of its own: this repo is also constructed from a
    // `Transaction` by the printing-accept flow, and nesting one there would
    // not be a savepoint. A single card's delete-then-insert is cheap enough
    // that the uncovered gap is a non-issue, and in-transaction callers get
    // atomicity from the transaction they already hold.
    await writeDerived(db, cardId, tokenCardIds);
  }

  return {
    recomputeForCard,

    async recomputeForPrintingCard(printingId: string): Promise<void> {
      const row = await db
        .selectFrom("printings")
        .select(["printings.cardId"])
        .where("printings.id", "=", printingId)
        .executeTakeFirst();

      if (!row) {
        return;
      }

      // Not `this.recomputeForCard`: instrumentRepo rebinds these methods onto
      // a new object, so a `this` reference here would not survive the wrapping.
      await recomputeForCard(row.cardId);
    },

    /**
     * Recompute the token relation for every card. Runs as one transaction so
     * readers never see a half-rebuilt table.
     */
    async recomputeAll(): Promise<{ totalCards: number; withTokens: number }> {
      const [tokens, typeSlugs] = await Promise.all([tokenCards(), cardTypeSlugs()]);

      const cards = await db.selectFrom("cards").select(["id"]).execute();

      const errata = await db
        .selectFrom("cardErrata")
        .select(["cardId", "correctedRulesText", "correctedEffectText"])
        .execute();
      const errataByCard = new Map(errata.map((row) => [row.cardId, row]));

      const printings = await db
        .selectFrom("printings")
        .select(["cardId", "printedRulesText", "printedEffectText"])
        .where("language", "=", WellKnown.language.EN)
        .execute();
      const printingsByCard = Map.groupBy(printings, (row) => row.cardId);

      const derived = cards
        .map((card) => ({
          cardId: card.id,
          tokenCardIds: findTokenReferences(
            textsOf({
              errata: errataByCard.get(card.id),
              printings: printingsByCard.get(card.id) ?? [],
            }),
            tokens,
            typeSlugs,
            card.id,
          ),
        }))
        .filter((row) => row.tokenCardIds.length > 0);

      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom("cardTokens").where("source", "=", "derived").execute();

        const values = derived.flatMap(({ cardId, tokenCardIds }) =>
          tokenCardIds.map((tokenCardId) => ({ cardId, tokenCardId, source: "derived" as const })),
        );

        for (const batch of rowBatches(values)) {
          await trx
            .insertInto("cardTokens")
            .values(batch)
            .onConflict((oc) => oc.columns(["cardId", "tokenCardId"]).doNothing())
            .execute();
        }
      });

      return { totalCards: cards.length, withTokens: derived.length };
    },
  };
}
