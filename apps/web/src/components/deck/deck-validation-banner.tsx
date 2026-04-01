import { CheckIcon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

const MAIN_ZONES = new Set(["main", "champion"]);
const SIDEBOARD_ZONE = "sideboard";
const EXCLUDED_TYPES = new Set(["Legend", "Rune", "Battlefield"]);

interface DeckValidationBannerProps {
  isDirty: boolean;
  isSaving: boolean;
}

export function DeckValidationBanner({ isDirty, isSaving }: DeckValidationBannerProps) {
  const violations = useDeckBuilderStore((state) => state.violations);
  const format = useDeckBuilderStore((state) => state.format);
  const cards = useDeckBuilderStore((state) => state.cards);

  const mainCards = cards.filter((card) => MAIN_ZONES.has(card.zone));
  const sideboardCards = cards.filter((card) => card.zone === SIDEBOARD_ZONE);
  const statCards = [...mainCards, ...sideboardCards];

  const totalCards = statCards.reduce((sum, card) => sum + card.quantity, 0);

  // Average energy (cost) — only cards that have an energy value
  let energySum = 0;
  let energyCount = 0;
  for (const card of statCards) {
    if (card.energy !== null) {
      energySum += card.energy * card.quantity;
      energyCount += card.quantity;
    }
  }
  const avgEnergy = energyCount > 0 ? (energySum / energyCount).toFixed(1) : "—";

  // Type breakdown — count per type, excluding zone-specific types
  const typeCounts = new Map<string, number>();
  for (const card of statCards) {
    if (!EXCLUDED_TYPES.has(card.cardType)) {
      typeCounts.set(card.cardType, (typeCounts.get(card.cardType) ?? 0) + card.quantity);
    }
  }

  const isValid = format === "freeform" || violations.length === 0;
  const violationCount = violations.length;

  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
      {/* Format badge — tooltip lists all violations when invalid */}
      {isValid ? (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
          {format === "freeform" ? "Freeform" : "Standard"}
          <CheckIcon className="size-3" />
        </span>
      ) : (
        <Tooltip>
          <TooltipTrigger className="bg-muted text-muted-foreground flex shrink-0 cursor-default items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
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

      {/* Stats — separated by middle dots */}
      <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 text-xs">
        <span>{totalCards} cards</span>
        <span>·</span>
        <span>Avg energy {avgEnergy}</span>
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
          <>
            <LoaderCircleIcon className="size-3 animate-spin" />
            Saving
          </>
        ) : isDirty ? (
          "Unsaved"
        ) : (
          <>
            <CheckIcon className="size-3" />
            Saved
          </>
        )}
      </span>
    </div>
  );
}
