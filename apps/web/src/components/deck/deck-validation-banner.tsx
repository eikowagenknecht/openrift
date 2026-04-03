import type { DeckZone } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

const MAIN_ZONES = new Set(["main", "champion"]);
const SIDEBOARD_ZONE = "sideboard";
const EXCLUDED_TYPES = new Set(["Legend", "Rune", "Battlefield"]);

const ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "Runes",
  battlefield: "Battlefields",
  main: "Main Deck",
  sideboard: "Sideboard",
  overflow: "Overflow",
};

interface DeckValidationBannerProps {
  isDirty: boolean;
  isSaving: boolean;
}

export function DeckValidationBanner({ isDirty, isSaving }: DeckValidationBannerProps) {
  const violations = useDeckBuilderStore((state) => state.violations);
  const format = useDeckBuilderStore((state) => state.format);
  const cards = useDeckBuilderStore((state) => state.cards);
  const activeZone = useDeckBuilderStore((state) => state.activeZone);
  const { toggleSidebar } = useSidebar();

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));
  const sideboardCards = cards.filter((card) => card.zone === SIDEBOARD_ZONE);
  const statCards = [...mainCards, ...sideboardCards];

  const totalCards = statCards.reduce((sum, card) => sum + card.quantity, 0);

  // Type breakdown — count per type, excluding zone-specific types
  const typeCounts = new Map<string, number>();
  for (const card of statCards) {
    if (!EXCLUDED_TYPES.has(card.cardType)) {
      typeCounts.set(card.cardType, (typeCounts.get(card.cardType) ?? 0) + card.quantity);
    }
  }

  const zoneCount = cards // custom: zone card count for mobile pill
    .filter((card) => card.zone === activeZone)
    .reduce((sum, card) => sum + card.quantity, 0);

  const isValid = format === "freeform" || violations.length === 0;
  const violationCount = violations.length;

  return (
    <div className="bg-muted/50 mx-3 mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
      {/* custom: mobile zone pill — opens sidebar */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-1 gap-1 text-sm font-medium md:hidden"
        onClick={toggleSidebar}
      >
        {ZONE_LABELS[activeZone]}
        <span className="text-muted-foreground">({zoneCount})</span>
        <ChevronDownIcon className="text-muted-foreground size-4" />
      </Button>

      {/* Format badge — tooltip lists all violations when invalid */}
      {isValid ? (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
          {format === "freeform" ? "Freeform" : "Standard"}
          <CheckIcon className="size-3" />
        </span>
      ) : (
        <Tooltip>
          <TooltipTrigger className="flex shrink-0 cursor-default items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            Standard
            <CircleAlertIcon className="size-3" />
            <span>
              {violationCount} {violationCount === 1 ? "issue" : "issues"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="max-w-80">
            <ul className="space-y-0.5">
              {violations.map((violation) => (
                <li key={violation.code} className="text-xs">
                  {violation.message}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Stats — desktop only, separated by middle dots */}
      <span className="text-muted-foreground hidden flex-wrap items-center gap-x-1.5 text-xs md:flex">
        <span>{totalCards} cards</span>
        {[...typeCounts.entries()].map(([type, count]) => (
          <span key={type} className="contents">
            <span>·</span>
            <span>
              {count} {count === 1 ? type : `${type}s`}
            </span>
          </span>
        ))}
      </span>

      {/* Save status — pushed to the right */}
      <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1 text-xs">
        {isSaving ? (
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <LoaderCircleIcon className="size-3 animate-spin" />
              <span className="hidden md:inline">Saving</span>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Saving</TooltipContent>
          </Tooltip>
        ) : isDirty ? (
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-500" />
              <span className="hidden md:inline">Unsaved</span>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Unsaved</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1">
              <CheckIcon className="size-3" />
              <span className="hidden md:inline">Saved</span>
            </TooltipTrigger>
            <TooltipContent className="md:hidden">Saved</TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
