import type { MissingImageCard, ProviderStatsResponse } from "@openrift/shared/types/api/admin";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type {
  CandidateCardsTable,
  CandidatePrintingsTable,
} from "../../../db/tables/candidates.js";
import type {
  CardNameAliasesTable,
  CardsTable,
  PrintingsTable,
} from "../../../db/tables/catalog.js";
import {
  CANONICAL_CANDIDATE_PRINTING_ORDER,
  notHiddenSource,
  notIgnoredCard,
  notIgnoredPrinting,
} from "./candidate-cards-shared.js";

export function candidateSourceListRepo(db: Kysely<Database>) {
  return {
    listAllCards(): Promise<
      (Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "type"> & {
        types: string[];
        setSlugs: string[];
        shortCodes: string[];
      })[]
    > {
      return db
        .selectFrom("cards as c")
        .leftJoin("printings as p", "p.cardId", "c.id")
        .leftJoin("sets as s", "s.id", "p.setId")
        .select((eb) => [
          "c.id",
          "c.slug",
          "c.name",
          "c.type",
          // Correlated subquery so the printings/sets join above doesn't
          // multiply the type rows.
          sql<string[]>`(
            select array_agg(cct.type_slug order by cct.position)
            from card_card_types cct
            where cct.card_id = c.id
          )`.as("types"),
          eb.fn
            .coalesce(
              sql<string[]>`array_agg(distinct s.slug) filter (where s.slug is not null)`,
              sql<string[]>`'{}'::text[]`,
            )
            .as("setSlugs"),
          eb.fn
            .coalesce(
              sql<
                string[]
              >`array_agg(distinct p.short_code) filter (where p.short_code is not null)`,
              sql<string[]>`'{}'::text[]`,
            )
            .as("shortCodes"),
        ])
        .groupBy(["c.id", "c.slug", "c.name", "c.type"])
        .orderBy("c.slug")
        .execute();
    },

    listCardsForSourceList(): Promise<
      Pick<Selectable<CardsTable>, "id" | "slug" | "name" | "normName">[]
    > {
      return db
        .selectFrom("cards")
        .select(["id", "slug", "name", "normName"])
        .orderBy("slug")
        .execute();
    },

    listAliasesForSourceList(): Promise<
      Pick<Selectable<CardNameAliasesTable>, "normName" | "cardId">[]
    > {
      return db.selectFrom("cardNameAliases").select(["normName", "cardId"]).execute();
    },

    listCandidateCardsForSourceList(): Promise<
      Pick<Selectable<CandidateCardsTable>, "id" | "normName" | "name" | "provider" | "checkedAt">[]
    > {
      return db
        .selectFrom("candidateCards")
        .select(["id", "normName", "name", "provider", "checkedAt"])
        .where(notIgnoredCard("candidateCards"))
        .where(notHiddenSource("candidateCards"))
        .orderBy("name")
        .execute();
    },

    listPrintingsForSourceList(): Promise<
      (Pick<Selectable<PrintingsTable>, "cardId" | "shortCode" | "language"> & {
        setSlug: string | null;
      })[]
    > {
      return db
        .selectFrom("printingsOrdered as p")
        .leftJoin("sets as s", "s.id", "p.setId")
        .select(["p.cardId", "p.shortCode", "p.language", "s.slug as setSlug"])
        .orderBy("p.canonicalRank")
        .execute();
    },

    async listCardsWithMissingImages(): Promise<MissingImageCard[]> {
      const rows = await db
        .selectFrom("printings as p")
        .innerJoin("cards as c", "c.id", "p.cardId")
        .select((eb) => [
          "p.cardId",
          "c.slug",
          "c.name",
          "p.language",
          eb.cast<number>(eb.fn.countAll(), "integer").as("count"),
        ])
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("printingImages as pi")
                .select(sql.lit(1).as("one"))
                .whereRef("pi.printingId", "=", "p.id")
                .where("pi.face", "=", "front")
                .where("pi.isActive", "=", true),
            ),
          ),
        )
        .groupBy(["p.cardId", "c.slug", "c.name", "p.language"])
        .orderBy("c.name")
        .orderBy("p.language")
        .execute();

      const cards = new Map<string, MissingImageCard>();
      for (const row of rows) {
        const card = cards.get(row.cardId) ?? {
          cardId: row.cardId,
          slug: row.slug,
          name: row.name,
          byLanguage: [],
        };
        card.byLanguage.push({ language: row.language, count: Number(row.count) });
        cards.set(row.cardId, card);
      }
      return [...cards.values()];
    },

    listCandidatePrintingsForSourceList(): Promise<
      Pick<
        Selectable<CandidatePrintingsTable>,
        "candidateCardId" | "shortCode" | "checkedAt" | "printingId" | "language" | "setId"
      >[]
    > {
      const query = db
        .selectFrom("candidatePrintings as ps")
        .innerJoin("candidateCards as cs", "cs.id", "ps.candidateCardId")
        .leftJoin("languages as l", "l.code", "ps.language")
        .leftJoin("sets as s", "s.slug", "ps.setId")
        .leftJoin("finishes as f", "f.slug", "ps.finish")
        .leftJoin("cardSizes as sz", "sz.slug", "ps.size")
        .select([
          "ps.candidateCardId",
          "ps.shortCode",
          "ps.checkedAt",
          "ps.printingId",
          "ps.language",
          // For candidate printings this column stores the set *slug* directly,
          // not a UUID like accepted printings.
          "ps.setId",
        ])
        .where(notIgnoredPrinting("ps", "cs"))
        .where(notHiddenSource("cs"));
      return CANONICAL_CANDIDATE_PRINTING_ORDER.reduce((q, key) => q.orderBy(key), query).execute();
    },

    async distinctArtists(): Promise<string[]> {
      const rows = await db
        .selectFrom("printings")
        .select("artist")
        .distinct()
        .orderBy("artist")
        .execute();
      return rows.map((r) => r.artist);
    },

    async distinctProviderNames(): Promise<string[]> {
      const rows = await db
        .selectFrom("candidateCards")
        .select("provider")
        .distinct()
        .orderBy("provider")
        .execute();
      return rows.map((r) => r.provider);
    },

    async providerStats(): Promise<ProviderStatsResponse[]> {
      const rows = await db
        .selectFrom("candidateCards as cs")
        .leftJoin("candidatePrintings as ps", "ps.candidateCardId", "cs.id")
        .select((eb) => [
          "cs.provider" as const,
          eb.cast<number>(eb.fn.count("cs.name").distinct(), "integer").as("cardCount"),
          eb.cast<number>(eb.fn.count("ps.id").distinct(), "integer").as("printingCount"),
          // Never null: the group has at least one candidate card, and
          // `candidate_cards.updated_at` is NOT NULL.
          sql<Date>`max(greatest(cs.updated_at, coalesce(ps.updated_at, cs.updated_at)))`.as(
            "lastUpdated",
          ),
        ])
        .where(notIgnoredCard("cs"))
        .groupBy("cs.provider")
        .orderBy("cs.provider")
        .execute();

      return rows.map((r) => ({
        provider: r.provider,
        cardCount: r.cardCount,
        printingCount: r.printingCount,
        lastUpdated: r.lastUpdated.toISOString(),
      }));
    },
  };
}
