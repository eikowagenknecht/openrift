import { evaluateListRule, evaluateListRules, expandList } from "@openrift/shared/list-rule-eval";
import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { useCards } from "@/features/cards/hooks/use-cards";
import { usePrices } from "@/features/cards/hooks/use-prices";
import { useCustomTagAssignments } from "@/features/collections/hooks/use-custom-tag-assignments";
import { useOwnedCount } from "@/features/collections/hooks/use-owned-count";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { copiesQueryOptions } from "@/features/collections/lib/copies-query";
import { RuleList } from "@/features/lists/components/rule-list";
import {
  ownedCopiesFromCopyList,
  ownedCopiesFromCounts,
} from "@/features/lists/lib/rule-owned-copies";
import { serializeRules } from "@/features/rules/lib/rule-draft";
import type { RuleWording } from "@/features/rules/lib/rule-wording";
import { matchLabel } from "@/features/rules/lib/rule-wording";
import { useRuleEditorStore } from "@/features/rules/stores/rule-editor-store";
import { useEnumOrders } from "@/hooks/use-enums";
import { useRequiredUserId } from "@/lib/auth-session";

/**
 * Both intents draw on the owner's personal copies only, mirroring the
 * server's `ownedRowsForUser`. An organize list may hold group-shared copies
 * added by hand, but a rule never produces one.
 */
export function CopyRuleEditor({
  intent,
  kind,
  wording,
}: {
  intent: ListIntent;
  kind: ListKind;
  wording: RuleWording;
}) {
  const userId = useRequiredUserId();
  const { data: collections } = useSuspenseQuery(collectionsQueryOptions(userId));
  const { allPrintings, printingsById } = useCards();
  const customTagAssignments = useCustomTagAssignments();
  // Reference orders keep the offered-copy count exact, matching the server's
  // keep/offer split, in overlapping protect cases.
  const { orders: enumOrders } = useEnumOrders();
  const rules = useRuleEditorStore((state) => state.rules);
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);

  const collectionOptions = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  // Fetched without suspending so the editor renders immediately and counts
  // fill in once the (possibly large) copy list loads.
  const { data: copies } = useQuery({
    ...copiesQueryOptions(userId),
    enabled: rules.length > 0,
  });

  const serialized = serializeRules(rules, kind);
  const priceLookup = usePrices();
  const ctx = {
    catalog: allPrintings,
    ownedCopies: copies ? ownedCopiesFromCopyList(copies, printingsById) : [],
    customTagAssignments,
    enumOrders,
    priceLookup,
  };
  // Undefined while copies load; the UI shows no count, never a misleading zero.
  const perRuleCounts = copies
    ? serialized.map((rule) => evaluateListRule(rule, kind, ctx).length)
    : undefined;
  const previewCount =
    copies && rules.length > 0
      ? expandList(kind, [], evaluateListRules(serialized, kind, ctx, ruleCombine)).length
      : null;

  return (
    <RuleList
      intent={intent}
      kind={kind}
      wording={wording}
      collectionOptions={collectionOptions}
      perRuleCounts={perRuleCounts}
      footer={
        rules.length >= 2 && previewCount !== null ? (
          <p className="text-muted-foreground -mt-1 text-sm">
            Combined, that&apos;s {matchLabel(previewCount, kind)} right now.
          </p>
        ) : null
      }
    />
  );
}

/** Under sum or netting, the combined footer total need not equal the sum of the per-rule counts. */
export function CardRuleEditor({
  intent,
  kind,
  wording,
}: {
  intent: ListIntent;
  kind: ListKind;
  wording: RuleWording;
}) {
  const { allPrintings, printingsById } = useCards();
  const customTagAssignments = useCustomTagAssignments();
  const rules = useRuleEditorStore((state) => state.rules);
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);

  // Owned counts only fetched when a rule nets, to skip the work otherwise.
  const needsOwned = rules.some((rule) => rule.netOwned);
  const { data: ownedCounts } = useOwnedCount(needsOwned);
  const ownedCopies = ownedCopiesFromCounts(needsOwned ? ownedCounts : undefined, printingsById);

  // Serialized from the reactive `rules` value, not the store's `buildRules`
  // (which reads `get()`), so the React Compiler tracks it as a dependency.
  const serialized = serializeRules(rules, kind);
  const priceLookup = usePrices();
  const ctx = { catalog: allPrintings, ownedCopies, customTagAssignments, priceLookup };
  const perRuleCounts = serialized.map((rule) => evaluateListRule(rule, kind, ctx).length);
  const previewCount =
    rules.length > 0
      ? expandList(kind, [], evaluateListRules(serialized, kind, ctx, ruleCombine)).length
      : null;

  // Distinguishes a shortfall count (every rule nets owned copies) from a
  // match count, for the footer phrasing below.
  const allNet = rules.every((rule) => rule.netOwned);

  return (
    <RuleList
      intent={intent}
      kind={kind}
      wording={wording}
      collectionOptions={[]}
      perRuleCounts={perRuleCounts}
      footer={
        rules.length >= 2 && previewCount !== null ? (
          <p className="text-muted-foreground -mt-1 text-sm">
            Combined, {allNet ? "you're still missing" : "that's"} {matchLabel(previewCount, kind)}{" "}
            right now.
          </p>
        ) : null
      }
    />
  );
}
