import { SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SectionHeading } from "@/components/ui/section-heading";
import { DeckOddsCustomGroupForm } from "@/features/decks/components/deck-odds-custom-group-form";
import { formatChancePct } from "@/features/decks/lib/deck-draw-odds";
import type {
  OddsGroupDef,
  OddsGroupPreset,
  OddsGroupRow,
  OddsGroupTheme,
} from "@/features/decks/lib/deck-odds-groups";
import { isInformativeGroupRow } from "@/features/decks/lib/deck-odds-groups";
import { cn } from "@/lib/utils";

const GROUP_THEMES: readonly OddsGroupTheme[] = ["Curve", "Interaction", "Economy", "Card types"];

function GroupCounts({ row, informative }: { row: OddsGroupRow; informative: boolean }) {
  return (
    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
      {informative
        ? `${row.copies} · ${formatChancePct(row.openingChance)}`
        : row.copies === 0
          ? "0 in deck"
          : "whole deck"}
    </span>
  );
}

interface DeckOddsGroupPickerProps {
  customDefs: readonly OddsGroupDef[];
  presets: OddsGroupPreset[];
  rowsByKey: ReadonlyMap<string, OddsGroupRow>;
  mainDeckSize: number;
  selectedSet: ReadonlySet<string>;
  hasOverride: boolean;
  canCustomize: boolean;
  typeLabels: Record<string, string>;
  onToggle: (key: string) => void;
  onReset: () => void;
  onAddCustom: (group: OddsGroupDef) => void;
  onRemoveCustom: (key: string) => void;
}

export function DeckOddsGroupPicker({
  customDefs,
  presets,
  rowsByKey,
  mainDeckSize,
  selectedSet,
  hasOverride,
  canCustomize,
  typeLabels,
  onToggle,
  onReset,
  onAddCustom,
  onRemoveCustom,
}: DeckOddsGroupPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Choose odds rows"
            className="ml-auto"
          />
        }
      >
        <SlidersHorizontalIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-80 overflow-y-auto p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Card groups</span>
          {hasOverride && (
            <Button type="button" variant="ghost" size="xs" onClick={onReset}>
              Reset to suggested
            </Button>
          )}
        </div>
        {!canCustomize && (
          <p className="text-muted-foreground mt-2 text-xs">
            Copy this deck to your decks to make your own groups.
          </p>
        )}
        {(customDefs.length > 0 || canCustomize) && (
          <SectionHeading as="h3" size="sm" className="mt-3 mb-1">
            This deck
          </SectionHeading>
        )}
        <div className="flex flex-col">
          {customDefs.map((def) => {
            const row = rowsByKey.get(def.key);
            if (!row) {
              return null;
            }
            const informative = isInformativeGroupRow(row, mainDeckSize);
            return (
              <div
                key={def.key}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1 py-1 text-sm",
                  !informative && "opacity-50",
                )}
              >
                <Checkbox
                  checked={selectedSet.has(def.key)}
                  disabled={!informative}
                  onCheckedChange={() => onToggle(def.key)}
                  aria-label={def.label}
                />
                <span className="min-w-0 flex-1 truncate">{def.label}</span>
                <GroupCounts row={row} informative={informative} />
                {canCustomize && (
                  <ChipRemoveButton
                    aria-label={`Remove ${def.label}`}
                    onClick={() => onRemoveCustom(def.key)}
                  />
                )}
              </div>
            );
          })}
          {canCustomize && <DeckOddsCustomGroupForm typeLabels={typeLabels} onAdd={onAddCustom} />}
        </div>
        {GROUP_THEMES.map((theme) => {
          const themed = presets.filter((preset) => preset.theme === theme);
          if (themed.length === 0) {
            return null;
          }
          return (
            <div key={theme}>
              <SectionHeading as="h3" size="sm" className="mt-3 mb-1">
                {theme}
              </SectionHeading>
              <div className="flex flex-col">
                {themed.map((preset) => {
                  const row = rowsByKey.get(preset.key);
                  if (!row) {
                    return null;
                  }
                  const informative = isInformativeGroupRow(row, mainDeckSize);
                  return (
                    <label
                      key={preset.key}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1 py-1 text-sm",
                        informative ? "hover:bg-muted/50 cursor-pointer" : "opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={selectedSet.has(preset.key)}
                        disabled={!informative}
                        onCheckedChange={() => onToggle(preset.key)}
                      />
                      <span className="min-w-0 flex-1 truncate">{preset.label}</span>
                      <GroupCounts row={row} informative={informative} />
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
