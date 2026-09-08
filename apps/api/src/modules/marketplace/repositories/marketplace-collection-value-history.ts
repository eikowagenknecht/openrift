import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import { customTagExists, STANDARD } from "./marketplace-scope.js";
import type { ScopeFilter } from "./marketplace-scope.js";

export interface CollectionValueHistoryPoint {
  date: string;
  valueCents: number;
  baselineValueCents: number;
  copyCount: number;
}

export function marketplaceCollectionValueHistoryRepo(db: Kysely<Database>) {
  return {
    async collectionValueTimeSeries(params: {
      userId: string;
      marketplace: string;
      collectionIds: string[] | null;
      cutoff: Date | null;
      scope: ScopeFilter;
    }): Promise<CollectionValueHistoryPoint[]> {
      const { userId, marketplace, collectionIds, cutoff, scope } = params;

      // Both the event query and the anchor query below join
      // printings/cards/sets under the same p/c/s aliases, so one fragment
      // serves both — they must agree, or the anchor would count copies the
      // walk never sees.
      const scopeClauses: ReturnType<typeof sql>[] = [];
      if (scope.sets?.length) {
        const vals = sql.join(scope.sets.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND s.slug IN (${vals})`);
      }
      if (scope.languages?.length) {
        const vals = sql.join(scope.languages.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.language IN (${vals})`);
      }
      if (scope.types?.length) {
        const vals = sql.join(scope.types.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.type IN (${vals})`);
      }
      if (scope.rarities?.length) {
        const vals = sql.join(scope.rarities.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.rarity IN (${vals})`);
      }
      if (scope.finishes?.length) {
        const vals = sql.join(scope.finishes.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.finish IN (${vals})`);
      }
      if (scope.artVariants?.length) {
        const vals = sql.join(scope.artVariants.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.art_variant IN (${vals})`);
      }
      if (scope.domains?.length) {
        const vals = sql.join(scope.domains.map((val) => sql`${val}`));
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_domains cd WHERE cd.card_id = c.id AND cd.domain_slug IN (${vals}))`,
        );
      }
      // `types` is a single column here, so its exclude is a plain NOT IN;
      // `domains` is a join table, so one excluded domain on the card rejects
      // it (matching `noneExcluded` in the web filters and `matchesScope` on
      // the stats page).
      if (scope.setsExclude?.length) {
        const vals = sql.join(scope.setsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND s.slug NOT IN (${vals})`);
      }
      if (scope.languagesExclude?.length) {
        const vals = sql.join(scope.languagesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.language NOT IN (${vals})`);
      }
      if (scope.typesExclude?.length) {
        const vals = sql.join(scope.typesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.type NOT IN (${vals})`);
      }
      if (scope.raritiesExclude?.length) {
        const vals = sql.join(scope.raritiesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.rarity NOT IN (${vals})`);
      }
      if (scope.finishesExclude?.length) {
        const vals = sql.join(scope.finishesExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.finish NOT IN (${vals})`);
      }
      if (scope.artVariantsExclude?.length) {
        const vals = sql.join(scope.artVariantsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.art_variant NOT IN (${vals})`);
      }
      if (scope.domainsExclude?.length) {
        const vals = sql.join(scope.domainsExclude.map((val) => sql`${val}`));
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_domains cd WHERE cd.card_id = c.id AND cd.domain_slug IN (${vals}))`,
        );
      }
      if (scope.keywords?.length) {
        const vals = sql.join(scope.keywords.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.keywords && ARRAY[${vals}]::text[]`);
      }
      if (scope.keywordsExclude?.length) {
        const vals = sql.join(scope.keywordsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND NOT (c.keywords && ARRAY[${vals}]::text[])`);
      }
      if (scope.tags?.length) {
        const vals = sql.join(scope.tags.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND c.tags && ARRAY[${vals}]::text[]`);
      }
      if (scope.tagsExclude?.length) {
        const vals = sql.join(scope.tagsExclude.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND NOT (c.tags && ARRAY[${vals}]::text[])`);
      }
      if (scope.customTags?.length) {
        scopeClauses.push(sql`AND ${customTagExists(scope.customTags)}`);
      }
      if (scope.customTagsExclude?.length) {
        scopeClauses.push(sql`AND NOT ${customTagExists(scope.customTagsExclude)}`);
      }
      if (scope.cardSizes?.length) {
        const vals = sql.join(scope.cardSizes.map((val) => sql`${val}`));
        scopeClauses.push(sql`AND p.size IN (${vals})`);
      }
      if (scope.keywordsPresence) {
        scopeClauses.push(
          scope.keywordsPresence === "any"
            ? sql`AND cardinality(c.keywords) > 0`
            : sql`AND cardinality(c.keywords) = 0`,
        );
      }
      if (scope.tagsPresence) {
        scopeClauses.push(
          scope.tagsPresence === "any"
            ? sql`AND cardinality(c.tags) > 0`
            : sql`AND cardinality(c.tags) = 0`,
        );
      }
      if (scope.customTagsPresence) {
        const hasAny = sql`EXISTS (SELECT 1 FROM card_custom_tags cct WHERE cct.card_id = c.id)`;
        scopeClauses.push(
          scope.customTagsPresence === "any" ? sql`AND ${hasAny}` : sql`AND NOT ${hasAny}`,
        );
      }
      if (scope.standard !== undefined) {
        scopeClauses.push(scope.standard ? sql`AND ${STANDARD}` : sql`AND NOT ${STANDARD}`);
      }
      if (scope.promos === "only") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) > 0`);
      } else if (scope.promos === "exclude") {
        scopeClauses.push(sql`AND cardinality(p.marker_slugs) = 0`);
      }
      if (scope.signed === true) {
        scopeClauses.push(sql`AND p.is_signed = true`);
      } else if (scope.signed === false) {
        scopeClauses.push(sql`AND p.is_signed = false`);
      }
      if (scope.banned === true) {
        scopeClauses.push(
          sql`AND EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      } else if (scope.banned === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_bans cb WHERE cb.card_id = c.id AND cb.unbanned_at IS NULL)`,
        );
      }
      if (scope.errata === true) {
        scopeClauses.push(sql`AND EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`);
      } else if (scope.errata === false) {
        scopeClauses.push(
          sql`AND NOT EXISTS (SELECT 1 FROM card_errata ce2 WHERE ce2.card_id = c.id)`,
        );
      }

      const scopeFragment = scopeClauses.length > 0 ? sql.join(scopeClauses, sql` `) : sql``;

      // In all-collections mode the anchor is personal copies only. Copies in a
      // friend-group collection belong to the group, and `buildStacks` in the
      // web app leaves them out of the aggregate the Stats card shows — the
      // anchor has to draw the same line or the two figures disagree on day
      // one. Scoped to explicit collection ids, every copy in them counts (a
      // group collection is viewed via its own id).
      const anchorCollectionClause = collectionIds
        ? sql`cp.collection_id IN (${sql.join(collectionIds.map((id) => sql`${id}::uuid`))})`
        : sql`col.user_id = ${userId} AND col.group_id IS NULL`;

      // Grouped by acquisition day and printing: two copies of one printing
      // bought on different days carry different baseline prices.
      const anchorRows = await sql<{
        printingId: string;
        acquiredOn: string | null;
        copies: number;
      }>`
        SELECT printing_id AS "printingId", acquired_on AS "acquiredOn", count(*)::int AS copies
        FROM (
          SELECT
            cp.printing_id,
            (
              SELECT min(ce.created_at)::date
              FROM collection_events ce
              WHERE ce.copy_id = cp.id AND ce.action = 'added'
            )::text AS acquired_on
          FROM copies cp
          INNER JOIN collections col ON col.id = cp.collection_id
          INNER JOIN printings p ON p.id = cp.printing_id
          INNER JOIN cards c ON c.id = p.card_id
          INNER JOIN sets s ON s.id = p.set_id
          WHERE ${anchorCollectionClause}
            ${scopeFragment}
        ) held
        GROUP BY printing_id, acquired_on
      `.execute(db);

      // Only events inside the window are needed. A forward replay had to read
      // the user's entire history to build the pre-cutoff state; anchoring to
      // the present means the 7d/30d/90d ranges never touch older rows.
      //
      // `fromIsGroup` / `toIsGroup` let all-collections mode keep the anchor's
      // personal-only line while walking back: a move across the group
      // boundary is a real entry or exit from the personal total, and an add
      // straight into a group collection never belonged to it. Old events may
      // have lost their collection id to a former ON DELETE SET NULL and read
      // as non-group, which is right for every affected account — deleting a
      // group collection is rarer still.
      const windowStartDay = cutoff ? toDateString(cutoff) : null;
      const windowClause = windowStartDay
        ? sql`AND ce.created_at >= ${windowStartDay}::date`
        : sql``;

      // `acquiredOn` resolves via the events table, not the copy row, so it
      // still works for copies that have since been deleted.
      const events = await sql<{
        action: string;
        printingId: string;
        fromCollectionId: string | null;
        toCollectionId: string | null;
        fromIsGroup: boolean;
        toIsGroup: boolean;
        acquiredOn: string | null;
        createdAt: Date;
      }>`
        SELECT
          ce.action,
          ce.printing_id AS "printingId",
          ce.from_collection_id AS "fromCollectionId",
          ce.to_collection_id AS "toCollectionId",
          (cf.group_id IS NOT NULL) AS "fromIsGroup",
          (ctc.group_id IS NOT NULL) AS "toIsGroup",
          (
            SELECT min(prior.created_at)::date
            FROM collection_events prior
            WHERE prior.copy_id = ce.copy_id AND prior.action = 'added'
          )::text AS "acquiredOn",
          ce.created_at AS "createdAt"
        FROM collection_events ce
        INNER JOIN printings p ON p.id = ce.printing_id
        INNER JOIN cards c ON c.id = p.card_id
        INNER JOIN sets s ON s.id = p.set_id
        LEFT JOIN collections cf ON cf.id = ce.from_collection_id
        LEFT JOIN collections ctc ON ctc.id = ce.to_collection_id
        WHERE ce.user_id = ${userId}
          ${windowClause}
          ${scopeFragment}
        ORDER BY ce.created_at ASC
      `.execute(db);

      if (events.rows.length === 0 && anchorRows.rows.length === 0) {
        return [];
      }

      const endDay = toDateString(new Date());
      // Without a cutoff the series starts at the first event, or today if none exist.
      // The baseline basis floors at this day: a copy bought earlier enters
      // the baseline at the window's opening price.
      const [firstEvent] = events.rows;
      const startDay = windowStartDay ?? (firstEvent ? toDateString(firstEvent.createdAt) : endDay);

      // Prices are needed for anything held today and anything touched inside
      // the window — a printing sold off mid-window is absent from the anchor
      // but reappears as we walk back.
      const printingIds = [
        ...new Set([
          ...anchorRows.rows.map((r) => r.printingId),
          ...events.rows.map((e) => e.printingId),
        ]),
      ];

      // The headline rule and the cheapest-bound-SKU aggregation live in
      // mv_daily_printing_prices, so the last point of this series and the
      // Stats card's figure come from the same rows —
      // mv_latest_printing_prices is that view's latest day. Do not
      // reintroduce a hand-rolled headline CASE here.
      const dailyPrices = await sql<{
        printingId: string;
        day: string;
        headlineCents: number;
      }>`
        SELECT
          d.printing_id AS "printingId",
          d.day::text AS day,
          d.headline_cents AS "headlineCents"
        FROM mv_daily_printing_prices d
        WHERE d.printing_id IN (${sql.join(printingIds.map((id) => sql`${id}::uuid`))})
          AND d.marketplace = ${marketplace}
      `.execute(db);

      const priceMap = new Map<string, Map<string, number>>();
      for (const row of dailyPrices.rows) {
        let dayMap = priceMap.get(row.printingId);
        if (!dayMap) {
          dayMap = new Map();
          priceMap.set(row.printingId, dayMap);
        }
        dayMap.set(row.day, row.headlineCents);
      }

      // Snapshot days per printing, ascending. The walk visits days in
      // descending order, so a per-printing cursor onto this array only ever
      // moves left — the price for a day is the latest snapshot at or before
      // it, same rule the Stats card gets from mv_latest_printing_prices.
      const sortedPriceDays = new Map<string, string[]>();
      for (const [printingId, dayMap] of priceMap) {
        sortedPriceDays.set(printingId, [...dayMap.keys()].toSorted());
      }
      const priceCursor = new Map<string, number>();

      /**
       * Price for `printingId` on `dayStr`, carried back from the latest
       * snapshot at or before it. Only correct when called with a
       * non-increasing `dayStr`, which the backward walk guarantees.
       */
      function priceOnDay(printingId: string, dayStr: string): number | undefined {
        const days = sortedPriceDays.get(printingId);
        if (!days || days.length === 0) {
          return undefined;
        }
        let idx = priceCursor.get(printingId) ?? days.length - 1;
        while (idx >= 0) {
          const day = days[idx];
          if (day === undefined || day <= dayStr) {
            break;
          }
          idx--;
        }
        priceCursor.set(printingId, idx);
        const day = idx < 0 ? undefined : days[idx];
        if (day === undefined) {
          return undefined;
        }
        return priceMap.get(printingId)?.get(day);
      }

      /**
       * The baseline price for one copy of `printingId` acquired on
       * `acquiredOn`, floored at `startDay`.
       *
       * Not `priceOnDay`: that cursor only moves left and must start at the
       * right edge, or every later day is mispriced. The first-ever-snapshot
       * fallback is safe only because the basis day is anchored to acquisition.
       */
      function basisFor(printingId: string, acquiredOn: string | null): number {
        const days = sortedPriceDays.get(printingId);
        if (!days || days.length === 0) {
          return 0;
        }
        const basisDay = acquiredOn && acquiredOn > startDay ? acquiredOn : startDay;
        const idx = days.findLastIndex((day) => day <= basisDay);
        const basisPriceDay = idx === -1 ? days[0] : days[idx];
        if (basisPriceDay === undefined) {
          return 0;
        }
        return priceMap.get(printingId)?.get(basisPriceDay) ?? 0;
      }

      const targetCollectionSet = collectionIds ? new Set(collectionIds) : null;

      /**
       * How much an event added to the tracked total when it happened. The
       * walk subtracts this to step back over the event.
       */
      function eventDelta(event: (typeof events.rows)[0]): number {
        if (targetCollectionSet) {
          const toTarget = event.toCollectionId
            ? targetCollectionSet.has(event.toCollectionId)
            : false;
          const fromTarget = event.fromCollectionId
            ? targetCollectionSet.has(event.fromCollectionId)
            : false;

          if (event.action === "added" && toTarget) {
            return 1;
          }
          if (event.action === "removed" && fromTarget) {
            return -1;
          }
          if (event.action === "moved") {
            if (toTarget && !fromTarget) {
              return 1;
            }
            if (fromTarget && !toTarget) {
              return -1;
            }
          }
          return 0;
        }
        // All-collections mode tracks the personal total, so group
        // collections sit outside it and crossing the boundary counts.
        if (event.action === "added") {
          return event.toIsGroup ? 0 : 1;
        }
        if (event.action === "removed") {
          return event.fromIsGroup ? 0 : -1;
        }
        if (event.action === "moved") {
          if (event.fromIsGroup && !event.toIsGroup) {
            return 1;
          }
          if (!event.fromIsGroup && event.toIsGroup) {
            return -1;
          }
        }
        return 0;
      }

      function undo(event: (typeof events.rows)[0]): void {
        const delta = eventDelta(event);
        if (delta === 0) {
          return;
        }
        const next = (composition.get(event.printingId) ?? 0) - delta;
        if (next <= 0) {
          composition.delete(event.printingId);
          basisByPrinting.delete(event.printingId);
          return;
        }
        composition.set(event.printingId, next);
        const nextBasis =
          (basisByPrinting.get(event.printingId) ?? 0) -
          delta * basisFor(event.printingId, event.acquiredOn);
        // Floored: an orphan `removed` with no matching `added` can drive this below zero.
        basisByPrinting.set(event.printingId, Math.max(0, nextBasis));
      }

      // Basis is kept per printing so a printing with no price on a given day
      // can be dropped from both lines together.
      const composition = new Map<string, number>();
      const basisByPrinting = new Map<string, number>();
      for (const row of anchorRows.rows) {
        composition.set(row.printingId, (composition.get(row.printingId) ?? 0) + row.copies);
        const basis = row.copies * basisFor(row.printingId, row.acquiredOn);
        basisByPrinting.set(row.printingId, (basisByPrinting.get(row.printingId) ?? 0) + basis);
      }
      let eventIndex = events.rows.length - 1;

      // Events dated after today (clock skew, or a same-day event recorded in
      // a later timezone) belong to no emitted point — undo them up front so
      // they don't leak into today's figure.
      while (eventIndex >= 0) {
        const event = events.rows[eventIndex];
        if (!event || toDateString(event.createdAt) <= endDay) {
          break;
        }
        undo(event);
        eventIndex--;
      }

      const reversed: CollectionValueHistoryPoint[] = [];
      const currentDay = new Date(endDay);

      while (toDateString(currentDay) >= startDay) {
        const dayStr = toDateString(currentDay);

        let valueCents = 0;
        let baselineValueCents = 0;
        let copyCount = 0;
        for (const [printingId, count] of composition) {
          copyCount += count;
          const price = priceOnDay(printingId, dayStr);
          if (price === undefined) {
            continue;
          }
          valueCents += price * count;
          baselineValueCents += basisByPrinting.get(printingId) ?? 0;
        }
        reversed.push({ date: dayStr, valueCents, baselineValueCents, copyCount });

        while (eventIndex >= 0) {
          const event = events.rows[eventIndex];
          if (!event || toDateString(event.createdAt) !== dayStr) {
            break;
          }
          undo(event);
          eventIndex--;
        }

        currentDay.setUTCDate(currentDay.getUTCDate() - 1);
      }

      const series = reversed.toReversed();

      // Drop leading empty days: an account whose earliest activity cancelled
      // out (adds undone by removes the same week) shouldn't open on a flat
      // zero run.
      const firstHeld = series.findIndex((point) => point.copyCount > 0);
      return firstHeld === -1 ? [] : series.slice(firstHeld);
    },
  };
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
