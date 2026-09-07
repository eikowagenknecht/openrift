import {
  evaluateListRules,
  expandList,
  ownedCopyPrintingScope,
} from "@openrift/shared/list-rule-eval";
import type {
  KeepPriorityOrders,
  ManualEntryRow,
  OwnedCopyRow,
} from "@openrift/shared/list-rule-eval";
import type { ListKind } from "@openrift/shared/types/api/list";
import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { Printing } from "@openrift/shared/types/catalog";
import { hydrateListRules, ruleFiltersOnPrice } from "@openrift/shared/types/list-rule";
import type { ListRules } from "@openrift/shared/types/list-rule";
import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListEntriesTable } from "../../../db/tables/lists.js";
import { buildRuleOnlyRow, fetchEnrichedEntries, loadRuleOnlyDetails } from "./lists-entry-rows.js";
import type { ListEntryRow } from "./lists-shared.js";
import { tradeOverrideFromRow } from "./lists-shared.js";

/**
 * Lazy providers a dynamic-rule list read needs but the repo can't build from
 * `db` alone. Wired in `createRepos`; only invoked when a list actually
 * carries a rule, so manual-only reads pay nothing.
 */
export interface ListRuleProviders {
  assembleCatalog: () => Promise<{
    printings: Printing[];
    customTagAssignments: Record<string, readonly string[]>;
  }>;
  /**
   * The given user's personally-owned copies, narrowed to `printingIds`.
   * Omitting the argument loads the whole collection, which is only correct
   * when the caller has no rule set to narrow by.
   */
  ownedCopies: (ownerId: string, printingIds?: readonly string[]) => Promise<OwnedCopyRow[]>;
  /**
   * Reference orders (finish / rarity / art-variant) a trade rule uses to keep
   * the nicer copies and offer the plainer ones.
   */
  enumOrders: () => Promise<KeepPriorityOrders>;
  /**
   * Latest-price lookup (major currency units) for rules with a price bound.
   * Wired to a content-addressed memo in `createRepos` so the uncached
   * public-share read never pays the full price-map load.
   */
  priceLookup: () => Promise<PriceLookup>;
}

export function listRulesRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    entriesWithDetails(listId: string, kind: ListKind, userId: string): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId, userId });
    },

    /** No user scoping — the caller has already verified access (e.g. by share token). */
    entriesWithDetailsAnon(listId: string, kind: ListKind): Promise<ListEntryRow[]> {
      return expandAndEnrich(db, providers, kind, { listId });
    },

    /**
     * Rule-expanded entry counts for several lists. Omits lists with no rules
     * (or that don't exist); callers keep their materialized count for those.
     */
    async expandedCounts(listIds: readonly string[]): Promise<Map<string, number>> {
      const counts = new Map<string, number>();
      if (listIds.length === 0 || !providers) {
        return counts;
      }

      const listRows = await db
        .selectFrom("lists")
        .select(["id", "kind", "rules", "ruleCombine", "userId"])
        .where("id", "in", [...listIds])
        .execute();
      const ruleLists = listRows
        .map((row) => ({ ...row, rules: hydrateListRules(row.rules) }))
        .filter((row) => row.rules.length > 0);
      if (ruleLists.length === 0) {
        return counts;
      }

      // One inventory read per owner, not per list.
      const owners = [
        ...new Set(ruleLists.filter((row) => needsOwnedCopies(row.rules)).map((row) => row.userId)),
      ];

      // Everything below depends only on `ruleLists`, so it all overlaps. The
      // per-list path deliberately loads prices *before* copies (its
      // `ownedCopyPrintingScope` narrowing has to see the same prices the
      // evaluation will), but this path loads copies unscoped, so no such
      // ordering applies and the round trips can go out together.
      const [manualRows, catalogData, ownedByOwner, priceLookup, enumOrders] = await Promise.all([
        db
          .selectFrom("listEntries")
          .select([
            "id",
            "listId",
            "kind",
            "cardId",
            "printingId",
            "copyId",
            "quantity",
            "pricePref",
            "priceAbsoluteCents",
            "tradeType",
          ])
          .where(
            "listId",
            "in",
            ruleLists.map((row) => row.id),
          )
          .execute(),
        providers.assembleCatalog(),
        Promise.all(
          owners.map(async (owner) => [owner, await providers.ownedCopies(owner)] as const),
        ).then((entries) => new Map(entries)),
        ruleLists.some((row) => row.rules.some(ruleFiltersOnPrice))
          ? providers.priceLookup()
          : undefined,
        ruleLists.some((row) => row.rules.some((rule) => rule.kind === "trade"))
          ? providers.enumOrders()
          : undefined,
      ]);
      const manualByList = Map.groupBy(manualRows, (row) => row.listId);
      const { printings: catalog, customTagAssignments } = catalogData;

      for (const list of ruleLists) {
        const manual = (manualByList.get(list.id) ?? []).map((row) => toRawManualEntryRow(row));
        const ruleEntries = evaluateListRules(
          list.rules,
          list.kind,
          {
            catalog,
            ownedCopies: ownedByOwner.get(list.userId) ?? [],
            customTagAssignments,
            enumOrders,
            priceLookup,
          },
          list.ruleCombine,
        );
        counts.set(list.id, expandList(list.kind, manual, ruleEntries).length);
      }
      return counts;
    },
  };
}

function entryTargetKey(row: ListEntryRow): string {
  if (row.kind === "card") {
    return row.cardId;
  }
  if (row.kind === "printing") {
    return row.printingId;
  }
  return row.copyId;
}

function expandedTargetKey(
  kind: ListKind,
  entry: { cardId?: string; printingId?: string; copyId?: string },
): string {
  if (kind === "card") {
    return entry.cardId ?? "";
  }
  if (kind === "printing") {
    return entry.printingId ?? "";
  }
  return entry.copyId ?? "";
}

/**
 * Whether a rule set consults the owner's copies: a trade rule takes them as
 * its supply, and a `netOwned` wish rule subtracts what the owner already has.
 * Kept as one predicate so the per-list and batched-count paths can't drift on
 * which rules trigger the inventory load.
 */
function needsOwnedCopies(rules: ListRules): boolean {
  return rules.some((rule) => rule.kind === "trade" || (rule.kind === "wish" && rule.netOwned));
}

/**
 * Maps a raw `list_entries` row to the shape `expandList` merges rule output
 * against, skipping the enrichment joins.
 *
 * Safe for counting because the table's constraints already guarantee what those
 * joins would have checked: FKs to `cards` / `printings` / `copies` mean the
 * target row exists, `fk_list_entries_list_kind` means the entry's kind matches
 * its list's, and `chk_list_entries_kind_shape` means exactly the one id column
 * for that kind is set. So no row an INNER join would have dropped reaches here,
 * and the merged key set is the same one the enriched path produces.
 */
function toRawManualEntryRow(
  row: Pick<
    Selectable<ListEntriesTable>,
    | "id"
    | "kind"
    | "cardId"
    | "printingId"
    | "copyId"
    | "quantity"
    | "pricePref"
    | "priceAbsoluteCents"
    | "tradeType"
  >,
): ManualEntryRow {
  return {
    id: row.id,
    kind: row.kind,
    cardId: row.cardId,
    printingId: row.printingId,
    copyId: row.copyId,
    quantity: row.quantity,
    tradeOverride: tradeOverrideFromRow(row),
  };
}

function toManualEntryRow(row: ListEntryRow): ManualEntryRow {
  return {
    id: row.id ?? "",
    kind: row.kind,
    cardId: row.kind === "card" ? row.cardId : null,
    printingId: row.kind === "printing" || row.kind === "copy" ? row.printingId : null,
    copyId: row.kind === "copy" ? row.copyId : null,
    quantity: row.quantity,
    tradeOverride: row.tradeOverride,
  };
}

async function expandAndEnrich(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  kind: ListKind,
  scope: { listId: string; userId?: string },
): Promise<ListEntryRow[]> {
  const manual = await fetchEnrichedEntries(db, kind, scope);

  let ruleQuery = db
    .selectFrom("lists")
    .select(["rules", "ruleCombine", "userId"])
    .where("id", "=", scope.listId);
  if (scope.userId !== undefined) {
    ruleQuery = ruleQuery.where("userId", "=", scope.userId);
  }
  const listRow = await ruleQuery.executeTakeFirst();
  const rules = listRow ? hydrateListRules(listRow.rules) : [];
  if (!listRow || rules.length === 0 || !providers) {
    return manual;
  }

  const { printings: catalog, customTagAssignments } = await providers.assembleCatalog();
  // Loaded before the copy scope below — the scope must see the same prices as
  // the evaluation, or copy loading would drift from what the rules match.
  const priceLookup = rules.some((rule) => ruleFiltersOnPrice(rule))
    ? await providers.priceLookup()
    : undefined;
  const needsCopies = needsOwnedCopies(rules);
  // Only load the copies the rules can actually consult. Computed from the
  // catalog alone (no rule's match depends on what is owned), so this is a pure
  // narrowing of the same result set — see `ownedCopyPrintingScope`.
  const ownedCopies = needsCopies
    ? await providers.ownedCopies(
        listRow.userId,
        ownedCopyPrintingScope(rules, kind, { catalog, customTagAssignments, priceLookup }),
      )
    : [];
  // Trade rules rank owned copies by niceness (keep the nicer, offer the
  // plainer); wish rules don't, so the reference orders load only for trade rules.
  const needsKeepOrder = rules.some((rule) => rule.kind === "trade");
  const enumOrders = needsKeepOrder ? await providers.enumOrders() : undefined;
  const ruleEntries = evaluateListRules(
    rules,
    kind,
    {
      catalog,
      ownedCopies,
      customTagAssignments,
      enumOrders,
      priceLookup,
    },
    listRow.ruleCombine,
  );
  const expanded = expandList(
    kind,
    manual.map((row) => toManualEntryRow(row)),
    ruleEntries,
  );

  const manualByKey = new Map(manual.map((row) => [entryTargetKey(row), row]));
  const ruleOnlyKeys = expanded.filter((entry) => entry.id === null);
  const details = await loadRuleOnlyDetails(db, kind, ruleOnlyKeys);

  const result: ListEntryRow[] = [];
  for (const entry of expanded) {
    if (entry.id !== null) {
      // Manual or both: reuse the enriched manual row, but take the merged
      // quantity + source from the expansion.
      const base = manualByKey.get(expandedTargetKey(kind, entry));
      if (base) {
        result.push({
          ...base,
          quantity: entry.quantity,
          ruleQuantity: entry.ruleQuantity,
          source: entry.source,
        });
      }
      continue;
    }
    const row = buildRuleOnlyRow(kind, entry, details, scope.listId);
    if (row) {
      result.push(row);
    }
  }
  return result.sort((a, b) => a.cardName.localeCompare(b.cardName));
}
