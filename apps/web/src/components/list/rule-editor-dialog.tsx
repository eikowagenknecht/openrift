import type {
  CopyResponse,
  ListIntent,
  ListKind,
  ListRule,
  ListRuleCombine,
  OwnedCopyRow,
  Printing,
  RuleQuantity,
  TradeKeepPer,
} from "@openrift/shared";
import {
  defaultRuleCombine,
  evaluateListRule,
  evaluateListRules,
  expandList,
  legendDisplayName,
  MAX_LIST_RULES,
} from "@openrift/shared";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useLayoutEffect } from "react";
import { toast } from "sonner";

import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { CONTROL_WIDTH, FilterRow, RuleFilterEditor } from "@/components/list/rule-filter-editor";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCards } from "@/hooks/use-cards";
import { useCustomTagAssignments } from "@/hooks/use-custom-tag-assignments";
import { useEnumOrders } from "@/hooks/use-enums";
import { initQueryOptions } from "@/hooks/use-init";
import { useUpdateList } from "@/hooks/use-lists";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useRequiredUserId } from "@/lib/auth-session";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { copiesQueryOptions } from "@/lib/copies-query";
import { TRADE_RULE_PRESETS, WISH_RULE_PRESETS } from "@/lib/rule-presets";
import { useDisplayStore } from "@/stores/display-store";
import { serializeRules, useRuleEditorStore } from "@/stores/rule-editor-store";

interface RuleEditorDialogProps {
  listId: string;
  intent: ListIntent;
  kind: ListKind;
  currentRules: ListRule[];
  /** The saved combine mode; null = the intent's default (ADR-034 amendment 2). */
  currentRuleCombine: ListRuleCombine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Editor for a list's dynamic rules (ADR-034). Each rule's predicate is the full
 * controlled {@link RuleFilterEditor} (the same facets as the card browser) plus
 * mode math (target quantity for wish, keep-threshold + collection scope for
 * trade). Wish and trade lists may both carry several rules (add/remove); with
 * two or more, a combine-mode select says how they reconcile. A live preview
 * counts the deduped wish matches.
 * @returns The dialog node.
 */
export function RuleEditorDialog({
  listId,
  intent,
  kind,
  currentRules,
  currentRuleCombine,
  open,
  onOpenChange,
}: RuleEditorDialogProps) {
  const updateList = useUpdateList();
  const queryClient = useQueryClient();

  const load = useRuleEditorStore((state) => state.load);
  const reset = useRuleEditorStore((state) => state.reset);
  const buildRules = useRuleEditorStore((state) => state.buildRules);

  // Seed the draft from the saved rules whenever the dialog opens, and warm the
  // catalog + init queries the editor reads. Without the prewarm, the first time
  // a rule block mounts its `useSuspenseQuery` could suspend cold and collapse
  // the route's pending boundary (which would reset `open` and close the dialog).
  // The inner <Suspense> below is the safety net if a query is still in flight.
  //
  // Seeding runs in a layout effect so the drafts are loaded before the first
  // paint: the store is a singleton that outlives the dialog's mount, so a plain
  // effect would let one frame paint with the previous list's drafts. The
  // cleanup resets the store on close/unmount so nothing lingers between opens.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    load(currentRules, currentRuleCombine);
    void queryClient.ensureQueryData(catalogQueryOptions);
    void queryClient.ensureQueryData(initQueryOptions);
    return () => reset();
  }, [open, currentRules, currentRuleCombine, load, reset, queryClient]);

  const isTrade = intent === "trade";

  const handleSave = () => {
    if (updateList.isPending) {
      return;
    }
    const next = buildRules(intent);
    const ruleCombine = useRuleEditorStore.getState().ruleCombine;
    updateList.mutate(
      { listId, rules: next, ruleCombine },
      {
        onSuccess: () => {
          toast.success(next.length > 0 ? "Rules saved" : "Rules removed");
          onOpenChange(false);
        },
        onError: () => toast.error("Couldn't save the rules"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogForm onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Dynamic rules</DialogTitle>
            <DialogDescription>
              {isTrade
                ? "Automatically offer copies in your collection that match these filters. Add more than one rule to combine them."
                : "Automatically want every card that matches these filters. Add more than one rule to combine them."}
            </DialogDescription>
          </DialogHeader>

          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            {isTrade ? <TradeRuleEditor kind={kind} /> : <WishRuleEditor kind={kind} />}
          </Suspense>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={updateList.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateList.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The shared rule-list shell: an empty-state hint with one-click presets (common
 * setups that seed editable drafts), one {@link RuleBlock} per draft rule, the
 * combine-mode select (once two rules exist), an optional footer (the wish
 * preview), and an "Add rule" button that hides once the rule count reaches
 * `MAX_LIST_RULES` (each rule is a full-catalog pass at read time).
 * @returns The list shell node.
 */
function RuleList({
  kind,
  isTrade,
  collectionOptions,
  emptyMessage,
  perRuleCounts,
  footer,
}: {
  kind: ListKind;
  isTrade: boolean;
  collectionOptions: { value: string; label: string }[];
  emptyMessage: string;
  /** Wish only: how many cards/printings each rule matches on its own (by index). */
  perRuleCounts?: number[];
  footer?: ReactNode;
}) {
  const rules = useRuleEditorStore((state) => state.rules);
  const addRule = useRuleEditorStore((state) => state.addRule);
  const addDrafts = useRuleEditorStore((state) => state.addDrafts);
  // Seed a new rule's language facet from the user's preferred languages, so a
  // fresh rule starts scoped the way they browse. Still fully editable afterwards.
  const preferredLanguages = useDisplayStore((state) => state.languages);
  const presets = isTrade ? TRADE_RULE_PRESETS : WISH_RULE_PRESETS;

  return (
    <div className="flex flex-col gap-4">
      {rules.length === 0 && (
        <>
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          <div className="flex flex-col gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                onClick={() => addDrafts(preset.build(preferredLanguages))}
              >
                <span>{preset.label}</span>
                <span className="text-muted-foreground font-normal">{preset.description}</span>
              </Button>
            ))}
          </div>
        </>
      )}

      {rules.map((_, index) => (
        // Rules have no stable id; the store is the single source of truth and
        // each block selects its own slice by index, so an index key is fine.
        // oxlint-disable-next-line no-array-index-key -- store-keyed draft rows
        <RuleBlock
          key={index}
          index={index}
          kind={kind}
          title={`Rule ${index + 1}`}
          matchCount={perRuleCounts?.[index]}
          isTrade={isTrade}
          collectionOptions={collectionOptions}
        />
      ))}

      {rules.length >= 2 && <RuleCombineRow isTrade={isTrade} />}

      {footer}

      {rules.length < MAX_LIST_RULES && (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => addRule(preferredLanguages)}
        >
          <PlusIcon />
          Add rule
        </Button>
      )}
    </div>
  );
}

const WISH_COMBINE_OPTIONS = [
  { value: "sum", label: "Add up the quantities" },
  { value: "max", label: "Highest rule wins" },
] as const;

const TRADE_COMBINE_OPTIONS = [
  { value: "protect", label: "Keep everything a rule keeps" },
  { value: "count-sum", label: "Keep the totals added up" },
  { value: "count-max", label: "Keep the highest total" },
] as const;

const KEEP_PER_OPTIONS = [
  { value: "card", label: "Card (all printings together)" },
  { value: "printing", label: "Printing (each separately)" },
] as const;

/**
 * The combine-mode select, shown once a list has two or more rules (ADR-034
 * amendment 2). Wish lists reconcile overlapping quantities (sum / max); trade
 * lists reconcile keep-per-card splits (protect / count-sum / count-max). The
 * store's `null` renders as the intent's default so the select never looks
 * unset.
 * @returns The combine row node.
 */
function RuleCombineRow({ isTrade }: { isTrade: boolean }) {
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);
  const setRuleCombine = useRuleEditorStore((state) => state.setRuleCombine);
  const options = isTrade ? TRADE_COMBINE_OPTIONS : WISH_COMBINE_OPTIONS;
  const value = ruleCombine ?? defaultRuleCombine(isTrade ? "trade" : "wish");

  return (
    <>
      <FilterRow label="When rules overlap">
        <Select
          items={options}
          value={value}
          onValueChange={(next) => setRuleCombine(next as ListRuleCombine)}
        >
          <SelectTrigger className={CONTROL_WIDTH} aria-label="When rules overlap">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </FilterRow>
      <p className="text-muted-foreground -mt-3 text-sm">
        {isTrade
          ? value === "protect"
            ? "A copy is only offered when every rule that matches it agrees to offer it."
            : value === "count-sum"
              ? "Adds up the keep counts per card (or printing) and keeps your best copies up to that total."
              : "Uses the highest keep count per card (or printing) and keeps your best copies up to it."
          : value === "sum"
            ? "A card matched by several rules is wanted once per rule, added together."
            : "A card matched by several rules is wanted as much as the most demanding rule."}
      </p>
    </>
  );
}

/**
 * Trade-list rule editor: the shared {@link RuleList} with the trade-only
 * collection scope. Several rules combine per the list's mode (ADR-034
 * amendment 2). Each block shows how many copies that rule offers; a footer
 * shows the combined total once two rules exist.
 * @returns The trade editor node.
 */
function TradeRuleEditor({ kind }: { kind: ListKind }) {
  const userId = useRequiredUserId();
  const { data: collections } = useSuspenseQuery(collectionsQueryOptions(userId));
  const { allPrintings, printingsById } = useCards();
  const customTagAssignments = useCustomTagAssignments();
  // Reference orders make the offered-copy count exact (same keep/offer split as
  // the server) rather than sort-dependent in overlapping protect cases.
  const { orders: enumOrders } = useEnumOrders();
  const rules = useRuleEditorStore((state) => state.rules);
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);

  const collectionOptions = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  // The offered-copies preview needs the owner's real copies (not the catalog),
  // so fetch them without suspending: the editor renders immediately and the
  // counts fill in once the (possibly large) copy list loads. Skip the fetch
  // until there's a rule worth previewing.
  const { data: copies } = useQuery({
    ...copiesQueryOptions(userId),
    enabled: rules.length > 0,
  });

  // Serialize from the reactive `rules` value (see WishRuleEditor).
  const serialized = serializeRules(rules, "trade");
  const ctx = {
    catalog: allPrintings,
    ownedCopies: copies ? ownedCopiesFromCopyList(copies, printingsById) : [],
    customTagAssignments,
    enumOrders,
  };
  // Per-rule: copies each rule offers on its own. Combined: the deduped offer set
  // under the combine mode. Undefined/null while copies load, so the UI shows no
  // count rather than a misleading zero.
  const perRuleCounts = copies
    ? serialized.map((rule) => evaluateListRule(rule, kind, ctx).length)
    : undefined;
  const previewCount =
    copies && rules.length > 0
      ? expandList(kind, [], evaluateListRules(serialized, kind, ctx, ruleCombine)).length
      : null;

  return (
    <RuleList
      kind={kind}
      isTrade
      collectionOptions={collectionOptions}
      emptyMessage="No rule yet. Add one to automatically offer copies in your collection that match a filter."
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

/**
 * Wish-list rule editor: zero or more rules, each its own block, plus an
 * "Add rule" button. Each block shows how many cards/printings that rule matches
 * on its own; once two rules exist, a footer shows the combined total after they
 * merge (which, under sum or netting, need not equal the sum of the per-rule
 * counts).
 * @returns The wish editor node.
 */
function WishRuleEditor({ kind }: { kind: ListKind }) {
  const { allPrintings, printingsById } = useCards();
  const customTagAssignments = useCustomTagAssignments();
  const rules = useRuleEditorStore((state) => state.rules);
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);

  // Net-owned rules subtract the user's copies, so the preview needs them too.
  // Expand the per-printing owned counts into rows the evaluator can tally
  // (only when a rule actually nets, to skip the work otherwise).
  const needsOwned = rules.some((rule) => rule.netOwned);
  const { data: ownedCounts } = useOwnedCount(needsOwned);
  const ownedCopies = ownedCopiesFromCounts(needsOwned ? ownedCounts : undefined, printingsById);

  // Serialize from the reactive `rules` value (not the store's `buildRules`,
  // which reads `get()`) so the React Compiler sees the filter contents as a
  // dependency and recomputes on every edit.
  const serialized = serializeRules(rules, "wish");
  const ctx = { catalog: allPrintings, ownedCopies, customTagAssignments };
  // Per-rule: what each rule matches on its own (owned-netting applied per rule).
  const perRuleCounts = serialized.map((rule) => evaluateListRule(rule, kind, ctx).length);
  // Combined: the deduped union across every rule under the combine mode — the
  // count the user actually gets.
  const previewCount =
    rules.length > 0
      ? expandList(kind, [], evaluateListRules(serialized, kind, ctx, ruleCombine)).length
      : null;

  return (
    <RuleList
      kind={kind}
      isTrade={false}
      collectionOptions={[]}
      emptyMessage="No rules yet. Add one to automatically want every card that matches a filter."
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

/**
 * Pluralized rule-count label, e.g. "42 cards" / "1 printing" / "3 copies".
 * Wish counts are cards/printings; trade counts are copies.
 * @returns The count with its pluralized noun.
 */
function matchLabel(count: number, kind: ListKind): string {
  const [one, many] =
    kind === "card"
      ? ["card", "cards"]
      : kind === "printing"
        ? ["printing", "printings"]
        : ["copy", "copies"];
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * One rule, rendered as a bordered block with a remove button and the full facet
 * editor + quantity control. Shared by the wish and trade editors; `title` is the
 * header label ("Rule 1", "Rule 2", …). `matchCount` shows how many
 * cards/printings a wish rule matches (or copies a trade rule offers) on its
 * own, next to the title.
 * @returns The block node.
 */
function RuleBlock({
  index,
  kind,
  title,
  matchCount,
  isTrade,
  collectionOptions,
}: {
  index: number;
  kind: ListKind;
  title: string;
  matchCount?: number;
  isTrade: boolean;
  collectionOptions: { value: string; label: string }[];
}) {
  const removeRule = useRuleEditorStore((state) => state.removeRule);

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{title}</span>
          {matchCount !== undefined && (
            <span className="text-muted-foreground text-xs">
              {isTrade ? "offers" : "matches"} {matchLabel(matchCount, kind)}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${title.toLowerCase()}`}
          onClick={() => removeRule(index)}
        >
          <Trash2Icon />
        </Button>
      </div>
      <RuleFields
        index={index}
        kind={kind}
        isTrade={isTrade}
        collectionOptions={collectionOptions}
      />
    </div>
  );
}

/**
 * The shared per-rule fields: the facet editor, the trade-only collection scope,
 * and the quantity / keep-per-card control. Reads and writes its rule by index.
 * @returns The fields node.
 */
function RuleFields({
  index,
  kind,
  isTrade,
  collectionOptions,
}: {
  index: number;
  kind: ListKind;
  isTrade: boolean;
  collectionOptions: { value: string; label: string }[];
}) {
  const rule = useRuleEditorStore((state) => state.rules[index]);
  const setFilter = useRuleEditorStore((state) => state.setFilter);
  const setQuantity = useRuleEditorStore((state) => state.setQuantity);
  const setKeepPerCard = useRuleEditorStore((state) => state.setKeepPerCard);
  const setKeepPer = useRuleEditorStore((state) => state.setKeepPer);
  const setNetOwned = useRuleEditorStore((state) => state.setNetOwned);
  const setCountSpecialVersions = useRuleEditorStore((state) => state.setCountSpecialVersions);
  const setCollectionIds = useRuleEditorStore((state) => state.setCollectionIds);

  if (!rule) {
    return null;
  }

  return (
    <>
      <RuleFilterEditor value={rule.filter} onChange={(next) => setFilter(index, next)} />

      {isTrade && (
        <FilterRow label="Collections">
          <MultiSelectCombobox
            triggerStyle="button"
            triggerClassName={CONTROL_WIDTH}
            placeholder="All collections"
            label="Collections"
            options={collectionOptions}
            selected={rule.collectionIds ?? []}
            onChange={(next) => setCollectionIds(index, next.length === 0 ? null : next)}
          />
        </FilterRow>
      )}

      {isTrade && (
        <FilterRow label="Keep counts per">
          <Select
            items={KEEP_PER_OPTIONS}
            value={rule.keepPer}
            onValueChange={(next) => setKeepPer(index, next as TradeKeepPer)}
          >
            <SelectTrigger className={CONTROL_WIDTH} aria-label="Keep counts per">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {KEEP_PER_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FilterRow>
      )}

      <FilterRow
        label={
          isTrade
            ? rule.keepPer === "printing"
              ? "Keep per printing"
              : "Keep per card"
            : "Want quantity"
        }
      >
        <QuantityControl
          value={isTrade ? rule.keepPerCard : rule.quantity}
          onChange={(next) => (isTrade ? setKeepPerCard(index, next) : setQuantity(index, next))}
        />
      </FilterRow>
      <p className="text-muted-foreground -mt-1 text-sm">
        {isTrade
          ? rule.keepPer === "printing"
            ? "Keep this many of each printing, and offer the rest. 0 trades all."
            : "Keep this many per card, counted across all its printings, and offer the rest. 0 trades all."
          : kind === "card"
            ? "How many of each matched card you want."
            : "How many of each matched printing you want."}
      </p>

      {!isTrade && (
        <FilterRow
          label="Only what I'm missing"
          hint="Subtract the copies you already own, so the list shows only the shortfall toward the quantity above. Anything you already have enough of drops off."
        >
          <Switch
            aria-label="Only what I'm missing"
            checked={rule.netOwned}
            onCheckedChange={(next) => setNetOwned(index, next)}
          />
        </FilterRow>
      )}

      {!isTrade && kind === "card" && rule.netOwned && rule.filter.isStandard === true && (
        <FilterRow
          label="Count special versions"
          hint="Alt arts, foils, signed and promo copies you own also fill the missing count. The list still only asks for standard printings."
        >
          <Switch
            aria-label="Count special versions"
            checked={rule.countSpecialVersions}
            onCheckedChange={(next) => setCountSpecialVersions(index, next)}
          />
        </FilterRow>
      )}

      <RuleExclusions
        index={index}
        kind={kind}
        isTrade={isTrade}
        excludeIds={rule.excludeIds}
        excludeCopyIds={rule.excludeCopyIds}
      />
    </>
  );
}

/**
 * A single removable exclusion chip: the resolved label plus an "X" that puts the
 * card/copy back on the list. Shared by the wish and trade exclusion rows.
 * @returns The chip node.
 */
function ExclusionChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm">
      {label}
      <ChipRemoveButton
        aria-label={`Stop excluding ${label}`}
        className="hover:bg-background/60 ml-0 p-0.5"
        onClick={onRemove}
      >
        <XIcon className="size-3.5" aria-hidden />
      </ChipRemoveButton>
    </span>
  );
}

/**
 * The rule's current manual exclusions, shown as removable chips so the user can
 * put a card back after excluding it from the list (ADR-034 §V). Wish lists name
 * each excluded card/printing from the catalog; trade lists exclude individual
 * physical copies, resolved to their card through {@link TradeCopyExclusions}.
 * @returns The exclusions row, or null when there are none.
 */
function RuleExclusions({
  index,
  kind,
  isTrade,
  excludeIds,
  excludeCopyIds,
}: {
  index: number;
  kind: ListKind;
  isTrade: boolean;
  excludeIds: string[];
  excludeCopyIds: string[];
}) {
  const { printingsById, printingsByCardId } = useCards();
  const toggleExcludeId = useRuleEditorStore((state) => state.toggleExcludeId);

  if (isTrade) {
    if (excludeCopyIds.length === 0) {
      return null;
    }
    return <TradeCopyExclusions index={index} copyIds={excludeCopyIds} />;
  }

  if (excludeIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">Excluded</span>
      <div className="flex flex-wrap gap-1.5">
        {excludeIds.map((id) => {
          const card =
            kind === "card" ? printingsByCardId.get(id)?.[0]?.card : printingsById[id]?.card;
          const label = card ? legendDisplayName(card) : "Removed card";
          return (
            <ExclusionChip key={id} label={label} onRemove={() => toggleExcludeId(index, id)} />
          );
        })}
      </div>
    </div>
  );
}

/**
 * A trade rule's excluded physical copies, one removable chip each so the user
 * can put a single copy back without clearing the rest (ADR-034 §V). Each copy id
 * resolves to its printing through the viewer's collection, so the chip names the
 * card; a copy that has since left the collection falls back to a generic label.
 * @returns The exclusions row.
 */
function TradeCopyExclusions({ index, copyIds }: { index: number; copyIds: string[] }) {
  const userId = useRequiredUserId();
  const { data: copies } = useSuspenseQuery(copiesQueryOptions(userId));
  const { printingsById } = useCards();
  const toggleExcludeCopyId = useRuleEditorStore((state) => state.toggleExcludeCopyId);

  const printingIdByCopyId = new Map(copies.map((copy) => [copy.id, copy.printingId]));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">Excluded</span>
      <div className="flex flex-wrap gap-1.5">
        {copyIds.map((copyId) => {
          const printingId = printingIdByCopyId.get(copyId);
          const card = printingId ? printingsById[printingId]?.card : undefined;
          const label = card ? legendDisplayName(card) : "Removed copy";
          return (
            <ExclusionChip
              key={copyId}
              label={label}
              onRemove={() => toggleExcludeCopyId(index, copyId)}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Expands per-printing owned counts into the lightweight copy rows the evaluator
 * tallies (it only counts by printing/card, so collection/reserved are unused).
 * Used purely for the net-owned live preview; the server uses real copies.
 * @returns Owned copy rows, or an empty array when counts are unavailable.
 */
function ownedCopiesFromCounts(
  counts: Record<string, number> | undefined,
  printingsById: Record<string, Printing>,
): OwnedCopyRow[] {
  if (!counts) {
    return [];
  }
  const rows: OwnedCopyRow[] = [];
  for (const [printingId, count] of Object.entries(counts)) {
    const printing = printingsById[printingId];
    if (!printing) {
      continue;
    }
    for (let copyIndex = 0; copyIndex < count; copyIndex++) {
      rows.push({
        copyId: `${printingId}#${copyIndex}`,
        printingId,
        cardId: printing.cardId,
        collectionId: "",
        reserved: false,
      });
    }
  }
  return rows;
}

/**
 * Maps the owner's real copies to the {@link OwnedCopyRow}s a trade rule
 * evaluates, for the offered-copies preview. Personal copies only
 * (`groupId === null`), mirroring the server's `ownedRowsForUser` — a trade list
 * offers only what you personally own. `cardId` comes from the catalog; a copy
 * whose printing isn't in the catalog is skipped. `reserved` is irrelevant to
 * the offered *count* (reserved copies are still offered), so it's left false.
 * @returns One owned-copy row per previewable personal copy.
 */
function ownedCopiesFromCopyList(
  copies: CopyResponse[],
  printingsById: Record<string, Printing>,
): OwnedCopyRow[] {
  const rows: OwnedCopyRow[] = [];
  for (const copy of copies) {
    if (copy.groupId !== null) {
      continue;
    }
    const printing = printingsById[copy.printingId];
    if (!printing) {
      continue;
    }
    rows.push({
      copyId: copy.id,
      printingId: copy.printingId,
      cardId: printing.cardId,
      collectionId: copy.collectionId,
      reserved: false,
    });
  }
  return rows;
}

const QUANTITY_MODES = [
  { value: "fixed", label: "Fixed" },
  { value: "playset", label: "Playset ×" },
] as const;

/**
 * Compound control for a {@link RuleQuantity}: a mode select plus a number.
 * @returns The control node.
 */
function QuantityControl({
  value,
  onChange,
}: {
  value: RuleQuantity;
  onChange: (next: RuleQuantity) => void;
}) {
  const amount = value.mode === "fixed" ? value.n : value.multiplier;
  return (
    <div className="flex items-center gap-2">
      <Select
        items={QUANTITY_MODES}
        value={value.mode}
        onValueChange={(mode) =>
          onChange(mode === "fixed" ? { mode: "fixed", n: 1 } : { mode: "playset", multiplier: 1 })
        }
      >
        <SelectTrigger className="w-36" aria-label="Quantity mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {QUANTITY_MODES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        type="number"
        className="w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        min={value.mode === "fixed" ? 0 : 1}
        value={amount}
        onChange={(event) => {
          // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an input value; Number() would yield NaN on trailing text
          const parsed = Number.parseInt(event.target.value, 10);
          const next = Number.isNaN(parsed) ? 0 : parsed;
          onChange(
            value.mode === "fixed"
              ? { mode: "fixed", n: Math.max(0, next) }
              : { mode: "playset", multiplier: Math.max(1, next) },
          );
        }}
        aria-label="Quantity amount"
      />
    </div>
  );
}
