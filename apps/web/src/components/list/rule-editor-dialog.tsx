import type {
  ListIntent,
  ListKind,
  ListRule,
  OwnedCopyRow,
  Printing,
  RuleQuantity,
} from "@openrift/shared";
import { evaluateListRules, expandList, legendDisplayName, MAX_LIST_RULES } from "@openrift/shared";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useLayoutEffect } from "react";
import { toast } from "sonner";

import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { CONTROL_WIDTH, FilterRow, RuleFilterEditor } from "@/components/list/rule-filter-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { initQueryOptions } from "@/hooks/use-init";
import { useUpdateList } from "@/hooks/use-lists";
import { useOwnedCount } from "@/hooks/use-owned-count";
import { useRequiredUserId } from "@/lib/auth-session";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { serializeRules, useRuleEditorStore } from "@/stores/rule-editor-store";

interface RuleEditorDialogProps {
  listId: string;
  intent: ListIntent;
  kind: ListKind;
  currentRules: ListRule[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Editor for a list's dynamic rules (ADR-034). Each rule's predicate is the full
 * controlled {@link RuleFilterEditor} (the same facets as the card browser) plus
 * mode math (target quantity for wish, keep-threshold + collection scope for
 * trade). Wish lists may carry several rules (add/remove); trade lists are
 * capped at one. A live preview counts the deduped wish matches.
 * @returns The dialog node.
 */
export function RuleEditorDialog({
  listId,
  intent,
  kind,
  currentRules,
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
    load(currentRules);
    void queryClient.ensureQueryData(catalogQueryOptions);
    void queryClient.ensureQueryData(initQueryOptions);
    return () => reset();
  }, [open, currentRules, load, reset, queryClient]);

  const isTrade = intent === "trade";

  const handleSave = () => {
    if (updateList.isPending) {
      return;
    }
    const next = buildRules(intent);
    updateList.mutate(
      { listId, rules: next },
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
        <DialogHeader>
          <DialogTitle>{isTrade ? "Dynamic rule" : "Dynamic rules"}</DialogTitle>
          <DialogDescription>
            {isTrade
              ? "Automatically offer copies in your collection that match these filters."
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
          <Button type="button" onClick={handleSave} disabled={updateList.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The shared rule-list shell: an empty-state hint, one {@link RuleBlock} per draft
 * rule, an optional footer (the wish preview), and an "Add rule" button that hides
 * once the rule count reaches `maxRules`. The wish editor caps at `MAX_LIST_RULES`
 * (each rule is a full-catalog pass at read time); the trade editor caps at one.
 * @returns The list shell node.
 */
function RuleList({
  kind,
  isTrade,
  collectionOptions,
  emptyMessage,
  maxRules,
  footer,
}: {
  kind: ListKind;
  isTrade: boolean;
  collectionOptions: { value: string; label: string }[];
  emptyMessage: string;
  maxRules: number;
  footer?: ReactNode;
}) {
  const rules = useRuleEditorStore((state) => state.rules);
  const addRule = useRuleEditorStore((state) => state.addRule);

  return (
    <div className="flex flex-col gap-4">
      {rules.length === 0 && <p className="text-muted-foreground text-sm">{emptyMessage}</p>}

      {rules.map((_, index) => (
        // Rules have no stable id; the store is the single source of truth and
        // each block selects its own slice by index, so an index key is fine.
        // oxlint-disable-next-line no-array-index-key -- store-keyed draft rows
        <RuleBlock
          key={index}
          index={index}
          kind={kind}
          title={maxRules === 1 ? "Rule" : `Rule ${index + 1}`}
          isTrade={isTrade}
          collectionOptions={collectionOptions}
        />
      ))}

      {footer}

      {rules.length < maxRules && (
        <Button type="button" variant="outline" className="self-start" onClick={() => addRule()}>
          <PlusIcon />
          Add rule
        </Button>
      )}
    </div>
  );
}

/**
 * Trade-list rule editor: the shared {@link RuleList} capped at one rule (the
 * route layer enforces the cap too), with the trade-only collection scope.
 * @returns The trade editor node.
 */
function TradeRuleEditor({ kind }: { kind: ListKind }) {
  const userId = useRequiredUserId();
  const { data: collections } = useSuspenseQuery(collectionsQueryOptions(userId));

  const collectionOptions = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  return (
    <RuleList
      kind={kind}
      isTrade
      collectionOptions={collectionOptions}
      emptyMessage="No rule yet. Add one to automatically offer copies in your collection that match a filter."
      maxRules={1}
    />
  );
}

/**
 * Wish-list rule editor: zero or more rules, each its own block, plus an
 * "Add rule" button. A live preview counts the deduped matches across all rules.
 * @returns The wish editor node.
 */
function WishRuleEditor({ kind }: { kind: ListKind }) {
  const { allPrintings, printingsById } = useCards();
  const customTagAssignments = useCustomTagAssignments();
  const rules = useRuleEditorStore((state) => state.rules);

  // Net-owned rules subtract the user's copies, so the preview needs them too.
  // Expand the per-printing owned counts into rows the evaluator can tally
  // (only when a rule actually nets, to skip the work otherwise).
  const needsOwned = rules.some((rule) => rule.netOwned);
  const { data: ownedCounts } = useOwnedCount(needsOwned);
  const ownedCopies = ownedCopiesFromCounts(needsOwned ? ownedCounts : undefined, printingsById);

  // Live preview: the deduped union across every rule is the count the user
  // will actually get. Serialize from the reactive `rules` value (not the
  // store's `buildRules`, which reads `get()`) so the React Compiler sees the
  // filter contents as a dependency and recomputes on every edit.
  const previewCount =
    rules.length > 0
      ? expandList(
          kind,
          [],
          evaluateListRules(serializeRules(rules, "wish"), kind, {
            catalog: allPrintings,
            ownedCopies,
            customTagAssignments,
          }),
        ).length
      : null;

  return (
    <RuleList
      kind={kind}
      isTrade={false}
      collectionOptions={[]}
      emptyMessage="No rules yet. Add one to automatically want every card that matches a filter."
      maxRules={MAX_LIST_RULES}
      footer={
        previewCount !== null && (
          <p className="text-muted-foreground -mt-1 text-sm">
            Matches {previewCount} {kind === "card" ? "card" : "printing"}
            {previewCount === 1 ? "" : "s"} right now.
          </p>
        )
      }
    />
  );
}

/**
 * One rule, rendered as a bordered block with a remove button and the full facet
 * editor + quantity control. Shared by the wish and trade editors; `title` is the
 * header label ("Rule 1" for wish, "Rule" for the single trade rule).
 * @returns The block node.
 */
function RuleBlock({
  index,
  kind,
  title,
  isTrade,
  collectionOptions,
}: {
  index: number;
  kind: ListKind;
  title: string;
  isTrade: boolean;
  collectionOptions: { value: string; label: string }[];
}) {
  const removeRule = useRuleEditorStore((state) => state.removeRule);

  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
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
  const setNetOwned = useRuleEditorStore((state) => state.setNetOwned);
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

      <FilterRow label={isTrade ? "Keep per card" : "Want quantity"}>
        <QuantityControl
          value={isTrade ? rule.keepPerCard : rule.quantity}
          onChange={(next) => (isTrade ? setKeepPerCard(index, next) : setQuantity(index, next))}
        />
      </FilterRow>
      <p className="text-muted-foreground -mt-1 text-sm">
        {isTrade
          ? "Keep this many per card, and offer the rest. 0 trades all."
          : kind === "card"
            ? "How many of each matched card to want."
            : "How many of each matched printing to want."}
      </p>

      {!isTrade && (
        <>
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
          {rule.netOwned && (
            <p className="text-muted-foreground -mt-1 text-sm">
              Heads up: when shared, the quantities reveal how many you own.
            </p>
          )}
        </>
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
 * The rule's current manual exclusions, shown as removable chips so the user can
 * put a card back after excluding it from the list (ADR-034 §V). Wish lists name
 * each excluded card/printing from the catalog; trade lists exclude individual
 * physical copies, which have no catalog name client-side, so they collapse to a
 * count with a single "Clear" affordance.
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
  const clearExcludeCopyIds = useRuleEditorStore((state) => state.clearExcludeCopyIds);

  if (isTrade) {
    if (excludeCopyIds.length === 0) {
      return null;
    }
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">
          {excludeCopyIds.length} excluded {excludeCopyIds.length === 1 ? "copy" : "copies"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={() => clearExcludeCopyIds(index)}>
          Clear
        </Button>
      </div>
    );
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
            <span
              key={id}
              className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm"
            >
              {label}
              <button
                type="button"
                aria-label={`Stop excluding ${label}`}
                className="hover:bg-background/60 hover:text-foreground rounded-sm p-0.5"
                onClick={() => toggleExcludeId(index, id)}
              >
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </span>
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
        deckbuildingAvailable: false,
        reserved: false,
      });
    }
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
