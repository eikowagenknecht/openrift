import type { OverlayBoard, OverlayBoardDirection, TierRow } from "@openrift/shared";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeOffIcon,
  LayoutListIcon,
  PlayIcon,
} from "lucide-react";
import { useState } from "react";

import type { PickedTierList } from "@/components/overlay/overlay-tier-list-picker";
import { OverlayTierListPicker } from "@/components/overlay/overlay-tier-list-picker";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useClearOverlay,
  usePushOverlayBoard,
  useSetOverlayBoardReveal,
} from "@/hooks/use-overlay";

/** @returns How many cards a board ranks, across every tier. */
function countCards(tiers: readonly TierRow[]): number {
  return tiers.reduce((sum, row) => sum + row.cards.length, 0);
}

/**
 * Prev / next through the reveal of the board on stream, with the position it
 * is at — the clicker the card queue already has, for the beat a ranking
 * segment is actually built on.
 *
 * @returns The reveal controls.
 */
function RevealControls({
  revealCount,
  total,
  onStep,
  isPending,
}: {
  revealCount: number;
  total: number;
  onStep: (revealCount: number) => void;
  isPending: boolean;
}) {
  // Held inside the board's own bounds: a count stored past the last card (a
  // "whole board" push) would otherwise show as `12 / 9` and disable Next.
  const shown = Math.min(revealCount, total);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onStep(shown - 1)}
        disabled={shown === 0 || isPending}
        aria-label="Take the last revealed card back off the board"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      <span className="text-muted-foreground w-14 text-center font-mono text-sm tabular-nums">
        {`${shown} / ${total}`}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => onStep(shown + 1)}
        disabled={shown >= total || isPending}
        aria-label="Reveal the next card on the board"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Puts one of the creator's tier lists on stream and steps its reveal.
 *
 * Two ways to open it, because they are two different segments: "Show whole
 * board" for talking over a finished ranking, and "Start reveal" for filling
 * the ladder card by card. Both push the same board and differ only in where
 * the reveal starts, so changing your mind mid-segment is one press.
 *
 * The board goes out as a copy of the list, so editing the list afterwards
 * leaves the stream alone until it is pushed again.
 *
 * @returns The board section.
 */
export function OverlayBoardSection({
  board,
  revealTotal,
}: {
  /** The board on stream right now, or null when none is up. */
  board: OverlayBoard | null;
  /** Steps the live board has — how many of its cards the catalogue can draw. */
  revealTotal: number;
}) {
  const pushBoard = usePushOverlayBoard();
  const setReveal = useSetOverlayBoardReveal();
  const clearOverlay = useClearOverlay();
  const [picked, setPicked] = useState<PickedTierList | null>(null);
  const [direction, setDirection] = useState<OverlayBoardDirection>("best-first");

  const push = (revealCount: number) => {
    if (!picked) {
      return;
    }
    pushBoard.mutate({
      board: { title: picked.title, tiers: picked.tiers, revealCount, direction },
    });
  };

  const isPending = pushBoard.isPending || setReveal.isPending;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Tier list on stream</h2>
      <p className="text-muted-foreground text-sm">
        Put a whole ranking up, or fill it in card by card while you talk through it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <OverlayTierListPicker selected={picked} onPick={setPicked} />
        {/* Which end the run starts from. Bottom-up is how a ranking segment is
            usually paced, but it is the creator's call, so neither is forced. */}
        <ToggleGroup
          aria-label="Reveal direction"
          variant="outline"
          spacing={0}
          value={[direction]}
          onValueChange={([next]) => {
            if (next === "best-first" || next === "worst-first") {
              setDirection(next);
            }
          }}
        >
          <ToggleGroupItem value="best-first" size="sm">
            Start at the top
          </ToggleGroupItem>
          <ToggleGroupItem value="worst-first" size="sm">
            Start at the bottom
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => push(picked === null ? 0 : countCards(picked.tiers))}
          disabled={picked === null || isPending}
        >
          <LayoutListIcon className="size-4" />
          Show whole board
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => push(0)}
          disabled={picked === null || isPending}
        >
          <PlayIcon className="size-4" />
          Start reveal
        </Button>
        {board !== null && (
          <>
            <RevealControls
              revealCount={board.revealCount}
              total={revealTotal}
              onStep={(revealCount) => setReveal.mutate({ revealCount })}
              isPending={isPending}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearOverlay.mutate()}
              disabled={clearOverlay.isPending}
            >
              <EyeOffIcon className="size-4" />
              Hide
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
