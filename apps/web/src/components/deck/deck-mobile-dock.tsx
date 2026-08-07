import type { DeckZone } from "@openrift/shared";
import { Redo2Icon, Undo2Icon } from "lucide-react";

import { useDeckUndo } from "@/components/deck/deck-undo-controls";
import { Button } from "@/components/ui/button";
import { Pressable } from "@/components/ui/pressable";
import { useSidebar } from "@/components/ui/sidebar";
import { useDeckCards } from "@/hooks/use-deck-builder";
import { useDeckDetail } from "@/hooks/use-decks";
import { lastChange } from "@/lib/deck-last-change";
import { ZONE_LABELS, zoneExpected } from "@/lib/deck-zone-labels";
import { cn } from "@/lib/utils";
import { useDeckUndoStore } from "@/stores/deck-undo-store";

/**
 * The zone's fill as a conic ring. Colour rides on `currentColor` so the tone
 * classes pick the same greens the rest of the deck surfaces use, in both
 * themes, instead of hard-coding a palette value into the gradient.
 * @returns The ring, or a plain dot when the zone has no target count.
 */
function ZoneRing({ count, expected }: { count: number; expected?: number }) {
  if (expected === undefined) {
    return (
      <span className="grid size-8 shrink-0 place-items-center" aria-hidden="true">
        <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
      </span>
    );
  }
  const filled = Math.min(100, Math.round((count / expected) * 100));
  const tone =
    count === expected
      ? "text-green-600 dark:text-green-500"
      : count > expected
        ? "text-destructive"
        : "text-primary";
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-8 shrink-0 place-items-center rounded-full", tone)}
      style={{ background: `conic-gradient(currentColor ${filled}%, var(--muted) ${filled}%)` }}
    >
      <span className="bg-background size-6 rounded-full" />
    </span>
  );
}

/**
 * Bottom dock for the phone deck editor: while a zone browser fills the
 * screen, this keeps the zone's fill, its counter and the last edit pinned to
 * the bottom edge, and offers a one-tap way back to the zone list.
 *
 * Mount it inside the editor's `SidebarProvider` — it opens the zone sheet
 * through `useSidebar`.
 *
 * @returns The docked bar.
 */
export function DeckMobileDock({ deckId, zone }: { deckId: string; zone: DeckZone }) {
  const cards = useDeckCards(deckId);
  const { data } = useDeckDetail(deckId);
  const { setOpenMobile } = useSidebar();
  const { canUndo, undo, canRedo, redo } = useDeckUndo(deckId);
  // The step the undo stack would restore, i.e. the deck before the last edit.
  const previous = useDeckUndoStore((state) =>
    state.deckId === deckId ? state.past.at(-1) : undefined,
  );

  const count = cards
    .filter((card) => card.zone === zone)
    .reduce((sum, card) => sum + card.quantity, 0);
  const expected = zoneExpected(zone, data.deck.format);
  const change = previous ? lastChange(previous, cards) : null;

  return (
    <div className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-lg">
      {/* pb-safe owns the bottom padding (it already floors at 0.75rem), so
          the top side pads on its own to avoid a padding-shorthand clash. */}
      <div className="px-safe pb-safe mx-auto flex w-full max-w-3xl items-center gap-3 pt-2">
        <Pressable
          onClick={() => setOpenMobile(true)}
          aria-label="Open deck zones"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md"
        >
          <ZoneRing count={count} expected={expected} />
          <span className="flex min-w-0 flex-col text-xs leading-tight">
            <span className="font-medium">{ZONE_LABELS[zone]}</span>
            <span className="text-muted-foreground tabular-nums">
              {count}
              {expected !== undefined && `/${expected}`}
            </span>
          </span>
          {change && (
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
              <span
                className={cn(
                  "tabular-nums",
                  change.delta > 0 ? "text-green-600 dark:text-green-500" : "text-destructive",
                )}
              >
                {change.delta > 0 ? `+${change.delta}` : `−${Math.abs(change.delta)}`}
              </span>{" "}
              {change.cardName}
            </span>
          )}
        </Pressable>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Undo"
          disabled={!canUndo}
          onClick={undo}
          className="shrink-0"
        >
          <Undo2Icon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Redo"
          disabled={!canRedo}
          onClick={redo}
          className="shrink-0"
        >
          <Redo2Icon />
        </Button>
      </div>
    </div>
  );
}
