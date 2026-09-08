import { enumLabel } from "@openrift/shared/enum-label";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PowerDomainIcon } from "@/features/decks/components/deck-card-row";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { formatChancePct } from "@/features/decks/lib/deck-draw-odds";
import { buildRuneOddsRows, RUNE_ODDS_TURNS } from "@/features/decks/lib/deck-rune-odds";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";

// Runes are their own shuffled deck; this deliberately reads the real deck's
// rune zone and ignores the sideboard experiment, since runes can't be swapped.
export function DeckRuneOddsPanel({ cards }: { cards: DeckBuilderCard[] }) {
  const [goingSecond, setGoingSecond] = useState(false);
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const rows = buildRuneOddsRows(cards, { goingSecond });
  if (rows.length === 0) {
    return null;
  }
  return (
    <div>
      <div className="text-muted-foreground text-2xs mb-1.5 flex items-center gap-2 font-semibold tracking-wide uppercase">
        Rune odds
        <ToggleGroup
          variant="outline"
          spacing={0}
          size="sm"
          value={[goingSecond ? "second" : "first"]}
          onValueChange={([next]) => setGoingSecond(next === "second")}
          aria-label="Play order"
          className="ml-auto"
        >
          <ToggleGroupItem value="first">Going first</ToggleGroupItem>
          <ToggleGroupItem value="second">Going second</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="max-h-96 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th className="px-2 py-1.5 text-left font-medium">Runes</th>
              {RUNE_ODDS_TURNS.map((turn) => (
                <th
                  key={turn}
                  className="w-px px-2 py-1.5 text-right font-medium whitespace-nowrap"
                >
                  Turn {turn}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.domain}-${row.threshold}`} className="border-t">
                <td className="max-w-0 px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    <PowerDomainIcon domains={[row.domain]} colors={domainColors} />
                    <span className="truncate">
                      {row.threshold}+ {enumLabel(labels.domains, row.domain)}
                    </span>
                  </span>
                </td>
                {row.byTurn.map((chance, index) => (
                  <td
                    key={RUNE_ODDS_TURNS[index]}
                    className="w-px px-2 py-1 text-right whitespace-nowrap tabular-nums"
                  >
                    {/* 0 is structurally impossible; show a dash, not 0%. */}
                    {chance === 0 ? (
                      <span className="text-muted-foreground/60">–</span>
                    ) : (
                      formatChancePct(chance)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-2xs mt-1.5">
        Chance of having channeled at least that many runes of a domain by the end of each turn. You
        channel two runes a turn{goingSecond ? ", plus one more on your first turn" : ""}.
      </p>
    </div>
  );
}
