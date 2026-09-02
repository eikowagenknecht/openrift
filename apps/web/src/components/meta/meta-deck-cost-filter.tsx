import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useMetaDeckFilters } from "@/hooks/use-meta-deck-filters";
import { compactFormatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

export interface MetaDeckCostFilterProps {
  ready: boolean;
  withCollection: boolean;
  countUnderCost: (maxCost: number | null) => number;
  maxToComplete: number | undefined;
  maxValue: number | undefined;
}

type PriceFormat = (value?: number | null) => string;

export function useMetaPriceFormat(): PriceFormat {
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  return compactFormatterForMarketplace(marketplace);
}

export function metaCostBoundLabel(maxCost: number, format: PriceFormat): string {
  return maxCost === 0 ? "Buildable now" : `≤ ${format(maxCost)} to complete`;
}

export function metaValueRangeLabel(
  min: number | null,
  max: number | null,
  format: PriceFormat,
): string | null {
  if (min !== null && max !== null) {
    return `Value ${format(min)} – ${format(max)}`;
  }
  if (min !== null) {
    return `Value ≥ ${format(min)}`;
  }
  if (max !== null) {
    return `Value ≤ ${format(max)}`;
  }
  return null;
}

function sliderScale(max: number | undefined): { max: number; step: number } {
  const ceiling = max === undefined ? 0 : Math.ceil(max);
  const step = ceiling > 200 ? 10 : ceiling > 50 ? 5 : 1;
  return { max: Math.ceil(ceiling / step) * step, step };
}

// Keeps a drag out of the URL until commit; the draft resets when the URL value changes.
function useSliderDraft<T>(external: T, key: string): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T | null>(null);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setDraft(null);
  }
  return [draft ?? external, setDraft];
}

function firstNumber(values: number | readonly number[], fallback: number): number {
  return typeof values === "number" ? values : (values[0] ?? fallback);
}

function pair(values: number | readonly number[], fallback: [number, number]): [number, number] {
  if (typeof values === "number") {
    return fallback;
  }
  return [values[0] ?? fallback[0], values[1] ?? fallback[1]];
}

export function MetaDeckCostFilter({
  ready,
  withCollection,
  countUnderCost,
  maxToComplete,
  maxValue,
}: MetaDeckCostFilterProps) {
  const filters = useMetaDeckFilters();
  const format = useMetaPriceFormat();

  const parts: string[] = [];
  if (withCollection && filters.maxCost !== null) {
    parts.push(metaCostBoundLabel(filters.maxCost, format));
  }
  const valueLabel = metaValueRangeLabel(filters.valueRange.min, filters.valueRange.max, format);
  if (valueLabel !== null) {
    parts.push(valueLabel);
  }
  const summary = parts.join(" · ");
  const isActive = ready && summary.length > 0;
  // The visible spans concatenate without a separator in the accessible name.
  const triggerLabel = ready ? (isActive ? `Cost: ${summary}` : "Cost: Any") : "Cost";

  return (
    <Popover>
      <PopoverTrigger
        disabled={!ready}
        aria-label={triggerLabel}
        render={
          <Badge
            variant={isActive ? "default" : "outline"}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; Badge owns all styling, the trigger carries aria-label
            render={<button type="button" />}
          />
        }
      >
        <span className={isActive ? "text-primary-foreground/70" : "text-muted-foreground"}>
          Cost
        </span>
        {ready && <span>{isActive ? summary : "Any"}</span>}
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-2.5">
        <ToCompleteSection
          withCollection={withCollection}
          countUnderCost={countUnderCost}
          maxToComplete={maxToComplete}
          format={format}
        />
        <div className="bg-border -mx-2.5 h-px" />
        <ValueSection maxValue={maxValue} format={format} />
        <div className="bg-border -mx-2.5 h-px" />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => filters.clearCostFilters()}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{children}</p>
  );
}

function ToCompleteSection({
  withCollection,
  countUnderCost,
  maxToComplete,
  format,
}: {
  withCollection: boolean;
  countUnderCost: (maxCost: number | null) => number;
  maxToComplete: number | undefined;
  format: PriceFormat;
}) {
  const filters = useMetaDeckFilters();
  const scale = sliderScale(maxToComplete);
  const bound = Math.max(scale.max, scale.step);
  const [value, setDraft] = useSliderDraft(filters.maxCost ?? bound, String(filters.maxCost));

  if (!withCollection) {
    return (
      <div className="flex flex-col gap-1.5">
        <SectionLabel>To complete</SectionLabel>
        <p className="text-muted-foreground text-sm">
          Sign in to see what each list costs you to complete.
        </p>
      </div>
    );
  }

  const matches = countUnderCost(value >= bound ? null : value);
  const commit = (next: number) => {
    setDraft(next);
    filters.setMaxCost(next >= bound ? null : next);
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>To complete</SectionLabel>
      <Slider
        min={0}
        max={bound}
        step={scale.step}
        value={[value]}
        disabled={scale.max === 0}
        aria-label="Maximum cost to complete"
        onValueChange={(next, details) => {
          const resolved = firstNumber(next, bound);
          setDraft(resolved);
          if (details.reason !== "drag") {
            commit(resolved);
          }
        }}
        onValueCommitted={(next) => commit(firstNumber(next, bound))}
      />
      <div className="flex items-center gap-2 text-sm">
        <span className="tabular-nums">
          {value >= bound ? "Any" : value === 0 ? "Buildable now" : format(value)}
        </span>
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">
          {matches === 1 ? "1 deck matches" : `${matches} decks match`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="meta-cost-include-sideboard"
          checked={filters.includeSideboard}
          onCheckedChange={(checked) => filters.setIncludeSideboard(checked === true)}
        />
        <Label htmlFor="meta-cost-include-sideboard" className="cursor-pointer font-normal">
          Count the sideboard too
        </Label>
      </div>
    </div>
  );
}

function ValueSection({ maxValue, format }: { maxValue: number | undefined; format: PriceFormat }) {
  const filters = useMetaDeckFilters();
  const scale = sliderScale(maxValue);
  const bound = Math.max(scale.max, scale.step);
  const { min, max } = filters.valueRange;
  const [range, setDraft] = useSliderDraft<[number, number]>(
    [min ?? 0, max ?? bound],
    `${min}:${max}`,
  );

  const commit = (next: [number, number]) => {
    setDraft(next);
    filters.setValueRange({
      min: next[0] <= 0 ? null : next[0],
      max: next[1] >= bound ? null : next[1],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Deck value</SectionLabel>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
          {format(range[0])}
        </span>
        <Slider
          min={0}
          max={bound}
          step={scale.step}
          value={range}
          disabled={scale.max === 0}
          aria-label="Deck value range"
          onValueChange={(next, details) => {
            const resolved = pair(next, [0, bound]);
            setDraft(resolved);
            if (details.reason !== "drag") {
              commit(resolved);
            }
          }}
          onValueCommitted={(next) => commit(pair(next, [0, bound]))}
          className="flex-1"
        />
        <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
          {range[1] >= bound ? "Any" : format(range[1])}
        </span>
      </div>
    </div>
  );
}
