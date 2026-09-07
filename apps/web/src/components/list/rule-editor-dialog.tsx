import type {
  CopyResponse,
  ListIntent,
  ListKind,
  ListRule,
  ListRuleCombine,
  Marketplace,
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
  WellKnown,
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
import { pricesQueryOptions, usePrices } from "@/hooks/use-prices";
import { useRequiredUserId } from "@/lib/auth-session";
import { catalogQueryOptions, loadCatalogTail } from "@/lib/catalog-query";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { copiesQueryOptions } from "@/lib/copies-query";
import { rulePresetsFor } from "@/lib/rule-presets";
import type { RuleWording } from "@/lib/rule-wording";
import { matchLabel, netOwnedHint, ruleCountLabel, ruleWording } from "@/lib/rule-wording";
import { useDisplayStore } from "@/stores/display-store";
import { serializeRules, useRuleEditorStore } from "@/stores/rule-editor-store";

interface RuleEditorDialogProps {
  listId: string;
  intent: ListIntent;
  kind: ListKind;
  currentRules: ListRule[];
  currentRuleCombine: ListRuleCombine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

  // Prewarms queries so a rule block's useSuspenseQuery doesn't suspend cold
  // and collapse the pending boundary, resetting `open` and closing the dialog.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    load(currentRules, currentRuleCombine);
    void (async () => {
      await queryClient.query({ ...catalogQueryOptions, staleTime: "static" });
      await loadCatalogTail(queryClient);
    })();
    void queryClient.query({ ...initQueryOptions, staleTime: "static" });
    void queryClient.query({ ...pricesQueryOptions, staleTime: "static" });
    return () => reset();
  }, [open, currentRules, currentRuleCombine, load, reset, queryClient]);

  const wording = ruleWording(intent, kind);

  const handleSave = () => {
    if (updateList.isPending) {
      return;
    }
    const next = buildRules(kind);
    const ruleCombine = useRuleEditorStore.getState().ruleCombine;
    updateList.mutate(
      { listId, rules: next, ruleCombine },
      {
        onSuccess: () => {
          toast.success(next.length > 0 ? "Rules saved" : "Rules removed");
          onOpenChange(false);
        },
        // No onError: a per-call handler runs in ADDITION to the global
        // mutation onError, which already toasts the server's message.
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogForm onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Dynamic rules</DialogTitle>
            <DialogDescription>{wording.description}</DialogDescription>
          </DialogHeader>

          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            {wording.isCopy ? (
              <CopyRuleEditor intent={intent} kind={kind} wording={wording} />
            ) : (
              <CardRuleEditor intent={intent} kind={kind} wording={wording} />
            )}
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

/** Each rule is a full-catalog pass at read time, hence the `MAX_LIST_RULES` cap. */
function RuleList({
  intent,
  kind,
  wording,
  collectionOptions,
  perRuleCounts,
  footer,
}: {
  intent: ListIntent;
  kind: ListKind;
  wording: RuleWording;
  collectionOptions: { value: string; label: string }[];
  perRuleCounts?: number[];
  footer?: ReactNode;
}) {
  const rules = useRuleEditorStore((state) => state.rules);
  const addRule = useRuleEditorStore((state) => state.addRule);
  const addDrafts = useRuleEditorStore((state) => state.addDrafts);
  const preferredLanguages = useDisplayStore((state) => state.languages);
  // Set-scoped presets snapshot the catalog's current main sets at apply time.
  const { sets } = useCards();
  const mainSetSlugs = sets
    .filter((set) => set.setType === WellKnown.setType.MAIN)
    .map((set) => set.slug);
  const presets = rulePresetsFor(intent, kind);

  return (
    <div className="flex flex-col gap-4">
      {rules.length === 0 && (
        <>
          <p className="text-muted-foreground text-sm">{wording.emptyMessage}</p>
          <div className="flex flex-col gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
                onClick={() =>
                  addDrafts(preset.build({ languages: preferredLanguages, mainSetSlugs }))
                }
              >
                <span>{preset.label}</span>
                <span className="text-muted-foreground font-normal">{preset.description}</span>
              </Button>
            ))}
          </div>
        </>
      )}

      {rules.map((_, index) => (
        // oxlint-disable-next-line no-array-index-key -- store-keyed draft rows
        <RuleBlock
          key={index}
          index={index}
          kind={kind}
          title={`Rule ${index + 1}`}
          matchCount={perRuleCounts?.[index]}
          wording={wording}
          collectionOptions={collectionOptions}
        />
      ))}

      {rules.length >= 2 && <RuleCombineRow kind={kind} wording={wording} />}

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

const KEEP_PER_OPTIONS = [
  { value: "card", label: "Card (all printings together)" },
  { value: "printing", label: "Printing (each separately)" },
] as const;

/** The store's `null` renders as the kind's default so the select never looks unset. */
function RuleCombineRow({ kind, wording }: { kind: ListKind; wording: RuleWording }) {
  const ruleCombine = useRuleEditorStore((state) => state.ruleCombine);
  const setRuleCombine = useRuleEditorStore((state) => state.setRuleCombine);
  const options = wording.combineOptions;
  const value = ruleCombine ?? defaultRuleCombine(kind);

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
      <p className="text-muted-foreground -mt-3 text-sm">{wording.combineHint(value)}</p>
    </>
  );
}

/**
 * Both intents draw on the owner's personal copies only, mirroring the
 * server's `ownedRowsForUser`. An organize list may hold group-shared copies
 * added by hand, but a rule never produces one.
 */
function CopyRuleEditor({
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
function CardRuleEditor({
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

function RuleBlock({
  index,
  kind,
  title,
  matchCount,
  wording,
  collectionOptions,
}: {
  index: number;
  kind: ListKind;
  title: string;
  matchCount?: number;
  wording: RuleWording;
  collectionOptions: { value: string; label: string }[];
}) {
  const removeRule = useRuleEditorStore((state) => state.removeRule);
  const netOwned = useRuleEditorStore((state) => state.rules[index]?.netOwned ?? false);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{title}</span>
          {matchCount !== undefined && (
            <span className="text-muted-foreground text-xs">
              {ruleCountLabel(matchCount, kind, wording, netOwned)}
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
        wording={wording}
        collectionOptions={collectionOptions}
      />
    </div>
  );
}

function RuleFields({
  index,
  kind,
  wording,
  collectionOptions,
}: {
  index: number;
  kind: ListKind;
  wording: RuleWording;
  collectionOptions: { value: string; label: string }[];
}) {
  const isCopy = wording.isCopy;
  const rule = useRuleEditorStore((state) => state.rules[index]);
  const setFilter = useRuleEditorStore((state) => state.setFilter);
  const setPriceMarketplace = useRuleEditorStore((state) => state.setPriceMarketplace);
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
      <RuleFilterEditor
        value={rule.filter}
        onChange={(next) => setFilter(index, next)}
        priceMarketplace={rule.priceMarketplace}
        onPriceMarketplaceChange={(next: Marketplace) => setPriceMarketplace(index, next)}
      />

      {isCopy && (
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

      {isCopy && (
        <FilterRow label={wording.groupLabel}>
          <Select
            items={KEEP_PER_OPTIONS}
            value={rule.keepPer}
            onValueChange={(next) => setKeepPer(index, next as TradeKeepPer)}
          >
            <SelectTrigger className={CONTROL_WIDTH} aria-label={wording.groupLabel}>
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

      <FilterRow label={wording.quantityLabel(rule.keepPer)}>
        <QuantityControl
          value={isCopy ? rule.keepPerCard : rule.quantity}
          onChange={(next) => (isCopy ? setKeepPerCard(index, next) : setQuantity(index, next))}
        />
      </FilterRow>
      <p className="text-muted-foreground -mt-1 text-sm">{wording.quantityHint(rule.keepPer)}</p>

      {!isCopy && (
        <FilterRow label="Only what I'm missing" hint={netOwnedHint(rule.filter.price)}>
          <Switch
            aria-label="Only what I'm missing"
            checked={rule.netOwned}
            onCheckedChange={(next) => setNetOwned(index, next)}
          />
        </FilterRow>
      )}

      {!isCopy && kind === "card" && rule.netOwned && rule.filter.isStandard === true && (
        <FilterRow
          label="Count special versions"
          hint="Alt arts, foils, and promos you own also count toward missing."
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
        isCopy={isCopy}
        excludeIds={rule.excludeIds}
        excludeCopyIds={rule.excludeCopyIds}
      />
    </>
  );
}

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

function RuleExclusions({
  index,
  kind,
  isCopy,
  excludeIds,
  excludeCopyIds,
}: {
  index: number;
  kind: ListKind;
  isCopy: boolean;
  excludeIds: string[];
  excludeCopyIds: string[];
}) {
  const { printingsById, printingsByCardId } = useCards();
  const toggleExcludeId = useRuleEditorStore((state) => state.toggleExcludeId);

  if (isCopy) {
    if (excludeCopyIds.length === 0) {
      return null;
    }
    return <CopyExclusions index={index} copyIds={excludeCopyIds} />;
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

function CopyExclusions({ index, copyIds }: { index: number; copyIds: string[] }) {
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
 * For the net-owned live preview only; the server uses real copies. The
 * evaluator only counts by printing/card, so collection/reserved are unused.
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

/** Personal copies only (`groupId === null`), mirroring the server's `ownedRowsForUser`. */
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
