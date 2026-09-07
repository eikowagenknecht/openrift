import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MetaPriceFormat as PriceFormat } from "@/features/meta/hooks/use-meta-price-format";
import { useMetaPriceFormat } from "@/features/meta/hooks/use-meta-price-format";
import { cn } from "@/lib/utils";

export interface MetaCostFilterValue {
  maxCost: number | null;
  valueRange: { min: number | null; max: number | null };
  includeSideboard: boolean;
}

export const EMPTY_META_COST_FILTER: MetaCostFilterValue = {
  maxCost: null,
  valueRange: { min: null, max: null },
  includeSideboard: false,
};

export interface MetaDeckCostFilterProps {
  ready: boolean;
  withCollection: boolean;
  countUnderCost: (maxCost: number | null) => number;
  maxToComplete: number | undefined;
  maxValue: number | undefined;
  value: MetaCostFilterValue;
  onMaxCostChange: (next: number | null) => void;
  onValueRangeChange: (next: { min: number | null; max: number | null }) => void;
  onIncludeSideboardChange: (next: boolean) => void;
  onClear: () => void;
  trigger?: "badge" | "control";
  noun?: "deck" | "list";
}

export type MetaDeckCostFilterData = Pick<
  MetaDeckCostFilterProps,
  "ready" | "withCollection" | "countUnderCost" | "maxToComplete" | "maxValue"
>;

const TO_COMPLETE_PRESETS = [10, 25, 50];
const VALUE_PRESETS = [25, 50, 100];
const ANY_PRESET = "any";

function metaCostBoundLabel(maxCost: number, format: PriceFormat): string {
  return maxCost === 0 ? "Buildable now" : `≤ ${format(maxCost)} to complete`;
}

function metaValueRangeLabel(
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
  value,
  onMaxCostChange,
  onValueRangeChange,
  onIncludeSideboardChange,
  onClear,
  trigger = "badge",
  noun = "deck",
}: MetaDeckCostFilterProps) {
  const format = useMetaPriceFormat();

  const parts: string[] = [];
  if (withCollection && value.maxCost !== null) {
    parts.push(metaCostBoundLabel(value.maxCost, format));
  }
  const valueLabel = metaValueRangeLabel(value.valueRange.min, value.valueRange.max, format);
  if (valueLabel !== null) {
    parts.push(valueLabel);
  }
  const summary = parts.join(" · ");
  const isActive = ready && summary.length > 0;
  // The visible spans concatenate without a separator in the accessible name.
  const triggerLabel = ready ? (isActive ? `Cost: ${summary}` : "Cost: Any") : "Cost";

  return (
    <Popover>
      {trigger === "control" ? (
        <PopoverTrigger
          disabled={!ready}
          aria-label={triggerLabel}
          render={
            <Button
              type="button"
              variant="outline"
              className={cn(isActive && "border-primary text-primary")}
            />
          }
        >
          <span className="text-muted-foreground font-normal">Cost</span>
          {ready && <span>{isActive ? summary : "Any"}</span>}
          <ChevronDownIcon />
        </PopoverTrigger>
      ) : (
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
      )}
      <PopoverContent align="start" className="w-80 gap-3 p-2.5">
        <ToCompleteSection
          withCollection={withCollection}
          countUnderCost={countUnderCost}
          maxToComplete={maxToComplete}
          format={format}
          noun={noun}
          maxCost={value.maxCost}
          includeSideboard={value.includeSideboard}
          onMaxCostChange={onMaxCostChange}
          onIncludeSideboardChange={onIncludeSideboardChange}
        />
        <div className="bg-border -mx-2.5 h-px" />
        <ValueSection
          maxValue={maxValue}
          format={format}
          valueRange={value.valueRange}
          onValueRangeChange={onValueRangeChange}
        />
        <div className="bg-border -mx-2.5 h-px" />
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => onClear()}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <SectionHeading as="h3">{children}</SectionHeading>;
}

function PresetPills({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (next: string) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      aria-label={label}
      className="w-full flex-wrap gap-1"
      value={[selected]}
      onValueChange={([next]) => {
        if (typeof next === "string") {
          onSelect(next);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function ToCompleteSection({
  withCollection,
  countUnderCost,
  maxToComplete,
  format,
  noun,
  maxCost,
  includeSideboard,
  onMaxCostChange,
  onIncludeSideboardChange,
}: {
  withCollection: boolean;
  countUnderCost: (maxCost: number | null) => number;
  maxToComplete: number | undefined;
  format: PriceFormat;
  noun: "deck" | "list";
  maxCost: number | null;
  includeSideboard: boolean;
  onMaxCostChange: (next: number | null) => void;
  onIncludeSideboardChange: (next: boolean) => void;
}) {
  const sideboardId = useId();
  const scale = sliderScale(maxToComplete);
  const bound = Math.max(scale.max, scale.step);
  const [value, setDraft] = useSliderDraft(maxCost ?? bound, String(maxCost));

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
    onMaxCostChange(next >= bound ? null : next);
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>To complete</SectionLabel>
      <PresetPills
        label="Cost to complete presets"
        options={[
          { value: ANY_PRESET, label: "Any" },
          { value: "0", label: "Buildable" },
          ...TO_COMPLETE_PRESETS.filter((preset) => preset <= bound).map((preset) => ({
            value: String(preset),
            label: `≤ ${format(preset)}`,
          })),
        ]}
        selected={maxCost === null ? ANY_PRESET : String(maxCost)}
        onSelect={(next) => onMaxCostChange(next === ANY_PRESET ? null : Number(next))}
      />
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
          {matches === 1 ? `1 ${noun} matches` : `${matches} ${noun}s match`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={sideboardId}
          checked={includeSideboard}
          onCheckedChange={(checked) => onIncludeSideboardChange(checked === true)}
        />
        <Label htmlFor={sideboardId} className="cursor-pointer font-normal">
          Count the sideboard too
        </Label>
      </div>
    </div>
  );
}

function ValueSection({
  maxValue,
  format,
  valueRange,
  onValueRangeChange,
}: {
  maxValue: number | undefined;
  format: PriceFormat;
  valueRange: { min: number | null; max: number | null };
  onValueRangeChange: (next: { min: number | null; max: number | null }) => void;
}) {
  const scale = sliderScale(maxValue);
  const bound = Math.max(scale.max, scale.step);
  const { min, max } = valueRange;
  const [range, setDraft] = useSliderDraft<[number, number]>(
    [min ?? 0, max ?? bound],
    `${min}:${max}`,
  );

  let selectedPreset = "";
  if (min === null) {
    selectedPreset = max === null ? ANY_PRESET : String(max);
  }

  const commit = (next: [number, number]) => {
    setDraft(next);
    onValueRangeChange({
      min: next[0] <= 0 ? null : next[0],
      max: next[1] >= bound ? null : next[1],
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Deck value</SectionLabel>
      <PresetPills
        label="Deck value presets"
        options={[
          { value: ANY_PRESET, label: "Any" },
          ...VALUE_PRESETS.filter((preset) => preset <= bound).map((preset) => ({
            value: String(preset),
            label: `≤ ${format(preset)}`,
          })),
        ]}
        selected={selectedPreset}
        onSelect={(next) =>
          onValueRangeChange(
            next === ANY_PRESET ? { min: null, max: null } : { min: null, max: Number(next) },
          )
        }
      />
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
