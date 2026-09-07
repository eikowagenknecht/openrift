import type { MetaEventTier } from "@openrift/shared/types/enums";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { MetaLegendSitemapRow } from "./meta-legends.js";
import { foldedPlayerIdentity } from "./meta-shared.js";

const SITEMAP_TIERS = ["premier", "competitive"] as const;

/** Applied to the *event's* fields, not the standings row's. */
export interface MetaCountsFilters {
  format?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** How many events the archive holds at each tier. */
export type MetaEventTierCounts = Record<MetaEventTier, number>;

export function metaArchiveRepo(db: Kysely<Database>) {
  /** The standings rows a count reads, narrowed by the event's own fields. */
  function playersInScope(filters: MetaCountsFilters) {
    let query = db
      .selectFrom("metaEventPlayers as p")
      .innerJoin("metaEvents as me", "me.id", "p.metaEventId");
    if (filters.format !== undefined) {
      query = query.where("me.format", "=", filters.format);
    }
    if (filters.dateFrom !== undefined) {
      query = query.where("me.eventDate", ">=", filters.dateFrom);
    }
    if (filters.dateTo !== undefined) {
      query = query.where("me.eventDate", "<=", filters.dateTo);
    }
    return query;
  }

  return {
    /**
     * The archive's side of the sync funnel: how many events it holds, how many
     * of those have standings at all, how many carry at least one decklist, and
     * how many decks that adds up to.
     */
    async archiveOverview(provider?: string): Promise<{
      events: number;
      eventsWithStandings: number;
      eventsWithDecklists: number;
      decks: number;
    }> {
      // When a provider is given, count only events that provider's citation
      // links, so the per-source funnel's "Published" is the archive this source
      // fed. The decks count follows the same restriction.
      let base = db.selectFrom("metaEvents as e");
      if (provider !== undefined) {
        base = base.where((eb) =>
          eb.exists(
            eb
              .selectFrom("metaEventSources as src")
              .whereRef("src.metaEventId", "=", "e.id")
              .where("src.provider", "=", provider),
          ),
        );
      }
      const row = await base
        .select((eb) => [
          eb.fn.countAll<string>().as("events"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p where p.meta_event_id = e.id
          ))`.as("eventsWithStandings"),
          sql<string>`count(*) filter (where exists (
            select 1 from meta_event_players p
            where p.meta_event_id = e.id and p.deck_id is not null
          ))`.as("eventsWithDecklists"),
          // A deck belongs to this slice when its event is in the filtered set.
          // The correlated exists keeps the provider restriction on the count.
          provider === undefined
            ? sql<string>`(select count(*) from meta_event_players p where p.deck_id is not null)`.as(
                "decks",
              )
            : sql<string>`(
                select count(*) from meta_event_players p
                where p.deck_id is not null and exists (
                  select 1 from meta_event_sources src
                  where src.meta_event_id = p.meta_event_id and src.provider = ${provider}
                )
              )`.as("decks"),
        ])
        .executeTakeFirstOrThrow();
      return {
        events: Number(row.events),
        eventsWithStandings: Number(row.eventsWithStandings),
        eventsWithDecklists: Number(row.eventsWithDecklists),
        decks: Number(row.decks),
      };
    },

    /** Every standings row in scope. */
    async playerCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Rows whose main deck the archive holds. `partial` counts exactly like
     * `full` — a partial list's main deck is complete by definition.
     */
    async deckCountInScope(filters: MetaCountsFilters): Promise<number> {
      const row = await playersInScope(filters)
        .where("p.listStatus", "!=", "none")
        .select((eb) => eb.cast<number>(eb.fn.countAll(), "integer").as("count"))
        .executeTakeFirst();
      return row?.count ?? 0;
    },

    /**
     * Events per tier across the whole archive, every tier present whether or
     * not an event sits at it. Deliberately unscoped: this is the archive's own
     * size, which a page prints beside a scoped number.
     */
    async eventTierCounts(): Promise<MetaEventTierCounts> {
      const rows = await db
        .selectFrom("metaEvents")
        .select((eb) => ["tier", eb.cast<number>(eb.fn.countAll(), "integer").as("count")])
        .groupBy("tier")
        .execute();
      const counts: MetaEventTierCounts = { premier: 0, competitive: 0, local: 0 };
      for (const row of rows) {
        counts[row.tier as MetaEventTier] = row.count;
      }
      return counts;
    },

    /**
     * `updatedAt` drives the `<lastmod>` the sitemap generator emits. Store
     * night events are excluded while the archive ramps up.
     */
    async sitemapEntries(): Promise<{
      events: { slug: string; updatedAt: string }[];
      decks: { slug: string; updatedAt: string }[];
      legends: MetaLegendSitemapRow[];
      players: { slug: string; updatedAt: string }[];
    }> {
      const [events, decks, legends, players] = await Promise.all([
        db
          .selectFrom("metaEvents")
          .select(["slug", "updatedAt"])
          .where("tier", "in", SITEMAP_TIERS)
          .orderBy("eventDate", "desc")
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("decks as d", "d.id", "p.deckId")
          .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
          .select(["d.shareToken as slug", "d.updatedAt"])
          .where("d.shareToken", "is not", null)
          .where("me.tier", "in", SITEMAP_TIERS)
          .$narrowType<{ slug: string }>()
          .execute(),
        // Unlike events and decks: dropping store-tier finishes would leave a linked page uncrawled.
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("cards as lc", "lc.id", "p.legendCardId")
          .leftJoin("mvCardAggregates as mca", "mca.cardId", "lc.id")
          .select([
            "lc.id as cardId",
            "lc.name",
            "lc.slug",
            "mca.types",
            "lc.tags",
            "mca.domains",
            sql<Date>`max(p.updated_at)`.as("updatedAt"),
          ])
          .groupBy(["lc.id", "lc.name", "lc.slug", "mca.types", "lc.tags", "mca.domains"])
          .orderBy("lc.name", "asc")
          .execute(),
        db
          .selectFrom("metaEventPlayers as p")
          .innerJoin("metaEvents as me", "me.id", "p.metaEventId")
          .select([foldedPlayerIdentity.as("slug"), sql<Date>`max(p.updated_at)`.as("updatedAt")])
          .where("p.sourceIdentity", "is not", null)
          .where("me.tier", "in", SITEMAP_TIERS)
          .groupBy(foldedPlayerIdentity)
          .execute(),
      ]);
      const toEntry = (row: { slug: string; updatedAt: Date }) => ({
        slug: row.slug,
        updatedAt: row.updatedAt.toISOString(),
      });
      return {
        events: events.map((row) => toEntry(row)),
        decks: decks.map((row) => toEntry(row)),
        legends,
        players: players.map((row) => toEntry(row)),
      };
    },
  };
}
