import { CoinsIcon, DicesIcon, RotateCcwIcon, Settings2Icon, ShuffleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { flipCoin, rollDie } from "@/lib/match-helpers";
import { useMatchTrackerStore } from "@/stores/match-tracker-store";

/**
 * Above-board controls: the points target, the pre-game helpers (random first
 * player, coin flip, die roll), and the reset / reconfigure actions.
 * @returns The toolbar row.
 */
export function MatchToolbar() {
  const pointsTarget = useMatchTrackerStore((state) => state.pointsTarget);
  const pickFirstPlayer = useMatchTrackerStore((state) => state.pickFirstPlayer);
  const startGame = useMatchTrackerStore((state) => state.startGame);
  const backToSetup = useMatchTrackerStore((state) => state.backToSetup);

  function handlePickFirstPlayer() {
    pickFirstPlayer();
    const { players, firstPlayerId } = useMatchTrackerStore.getState();
    const chosen = players.find((player) => player.id === firstPlayerId);
    if (chosen) {
      toast(`${chosen.name} goes first`);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <span className="text-muted-foreground text-sm">
        First to <span className="text-foreground font-semibold">{pointsTarget}</span> points
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={handlePickFirstPlayer}>
          <ShuffleIcon className="size-4" />
          First player
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toast(flipCoin() === "heads" ? "Heads" : "Tails")}
        >
          <CoinsIcon className="size-4" />
          Flip
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toast(`You rolled a ${rollDie()}`)}>
          <DicesIcon className="size-4" />
          Roll
        </Button>
        <Button variant="outline" size="sm" onClick={() => backToSetup()}>
          <Settings2Icon className="size-4" />
          Setup
        </Button>
        <Button variant="outline" size="sm" onClick={() => startGame()}>
          <RotateCcwIcon className="size-4" />
          New game
        </Button>
      </div>
    </div>
  );
}
