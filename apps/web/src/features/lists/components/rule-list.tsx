import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import type { ListRuleCombine, TradeKeepPer } from "@openrift/shared/types/list-rule";
import { defaultRuleCombine, MAX_LIST_RULES } from "@openrift/shared/types/list-rule";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MultiSelectCombobox } from "@/features/cards/components/multi-select-combobox";
import { useCards } from "@/features/cards/hooks/use-cards";
import { RuleExclusions } from "@/features/lists/components/rule-exclusions";
import {
  CONTROL_WIDTH,
  FilterRow,
  RuleFilterEditor,
} from "@/features/lists/components/rule-filter-editor";
import { QuantityControl } from "@/features/lists/components/rule-quantity-control";
import { rulePresetsFor } from "@/features/rules/lib/rule-presets";
import type { RuleWording } from "@/features/rules/lib/rule-wording";
import { netOwnedHint, ruleCountLabel } from "@/features/rules/lib/rule-wording";
import { useRuleEditorStore } from "@/features/rules/stores/rule-editor-store";
import { useDisplayStore } from "@/stores/display-store";

/** Each rule is a full-catalog pass at read time, hence the `MAX_LIST_RULES` cap. */
export function RuleList({
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
