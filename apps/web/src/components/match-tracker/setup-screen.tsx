import { PlayIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MAX_PLAYERS, MIN_PLAYERS, useMatchTrackerStore } from "@/stores/match-tracker-store";

const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, offset) => MIN_PLAYERS + offset,
);

/**
 * Pre-game setup: choose the player count, name everyone, and pick a points
 * target before starting.
 * @returns The setup form.
 */
export function SetupScreen() {
  const players = useMatchTrackerStore((state) => state.players);
  const pointsTarget = useMatchTrackerStore((state) => state.pointsTarget);
  const setPlayerCount = useMatchTrackerStore((state) => state.setPlayerCount);
  const renamePlayer = useMatchTrackerStore((state) => state.renamePlayer);
  const setPointsTarget = useMatchTrackerStore((state) => state.setPointsTarget);
  const startGame = useMatchTrackerStore((state) => state.startGame);

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-3 py-6">
      <header>
        <Heading level={1}>Match tracker</Heading>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep score and XP for everyone at the table on one device. Nothing leaves your browser.
        </p>
      </header>

      <div className="space-y-2">
        <Label>Players</Label>
        <div className="flex gap-2">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <Button
              key={count}
              type="button"
              variant={players.length === count ? "default" : "outline"}
              className="flex-1"
              aria-pressed={players.length === count}
              onClick={() => setPlayerCount(count)}
            >
              {count}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Names</Label>
        <div className="space-y-2">
          {players.map((player, index) => (
            <Input
              key={player.id}
              value={player.name}
              aria-label={`Name for player ${index + 1}`}
              onChange={(event) => renamePlayer(player.id, event.target.value)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="points-target">Points to win</Label>
        <Input
          id="points-target"
          type="number"
          min={1}
          value={pointsTarget}
          onChange={(event) => setPointsTarget(Number(event.target.value))}
          className={cn(
            "w-24 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0",
            "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0",
            "[&::-webkit-outer-spin-button]:appearance-none",
          )}
        />
        <p className="text-muted-foreground text-xs">
          Riftbound is first to 8 points (11 in team play); change it for your game.
        </p>
      </div>

      <Button size="lg" className="w-full" onClick={() => startGame()}>
        <PlayIcon className="size-4" />
        Start game
      </Button>
    </div>
  );
}
