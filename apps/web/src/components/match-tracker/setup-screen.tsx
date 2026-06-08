import { PlayIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TEAM_LABELS } from "@/lib/match-teams";
import { cn } from "@/lib/utils";
import type { TeamId } from "@/stores/match-tracker-store";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  teamMemberCounts,
  useMatchTrackerStore,
} from "@/stores/match-tracker-store";

const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, offset) => MIN_PLAYERS + offset,
);

const TEAM_OPTIONS: TeamId[] = [0, 1];

// Persistent primary fill for the active toggle option, overriding the base
// toggle's muted active state (including on hover) to match the prior
// variant="default" Button look.
const activeToggleClass =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

/**
 * A two-button toggle that puts one player on a team. Used only in 2v2 setup.
 * @returns The team selector for a single player row.
 */
function TeamToggle({
  playerName,
  team,
  onChange,
}: {
  playerName: string;
  team: TeamId;
  onChange: (team: TeamId) => void;
}) {
  return (
    <ToggleGroup
      className="shrink-0"
      variant="outline"
      value={[String(team)]}
      onValueChange={([next]) => {
        if (next === "0" || next === "1") {
          onChange(Number(next) as TeamId);
        }
      }}
    >
      {TEAM_OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option}
          value={String(option)}
          aria-label={`Put ${playerName} on ${TEAM_LABELS[option]}`}
          className={cn("w-9", activeToggleClass)}
        >
          {option + 1}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Pre-game setup: choose the player count and format, name everyone (and pick
 * teams for a 2v2), and set a points target before starting.
 * @returns The setup form.
 */
export function SetupScreen() {
  const players = useMatchTrackerStore((state) => state.players);
  const mode = useMatchTrackerStore((state) => state.mode);
  const pointsTarget = useMatchTrackerStore((state) => state.pointsTarget);
  const setPlayerCount = useMatchTrackerStore((state) => state.setPlayerCount);
  const setMode = useMatchTrackerStore((state) => state.setMode);
  const renamePlayer = useMatchTrackerStore((state) => state.renamePlayer);
  const setPlayerTeam = useMatchTrackerStore((state) => state.setPlayerTeam);
  const setPointsTarget = useMatchTrackerStore((state) => state.setPointsTarget);
  const startGame = useMatchTrackerStore((state) => state.startGame);

  const teamsActive = mode === "teams" && players.length === MAX_PLAYERS;
  const [teamOneCount, teamTwoCount] = teamMemberCounts(players);
  const teamsBalanced = teamOneCount === 2 && teamTwoCount === 2;
  const canStart = !teamsActive || teamsBalanced;

  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-3 py-6">
      <header>
        <Heading level={1}>Match tracker</Heading>
        <p className="text-muted-foreground mt-1 text-sm">
          Keep score and XP for everyone at the table on one device.
        </p>
      </header>

      <div className="space-y-2">
        <Label>Players</Label>
        <ToggleGroup
          className="w-full"
          variant="outline"
          spacing={2}
          aria-label="Players"
          value={[String(players.length)]}
          onValueChange={([next]) => {
            const count = Number(next);
            if (PLAYER_COUNT_OPTIONS.includes(count)) {
              setPlayerCount(count);
            }
          }}
        >
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <ToggleGroupItem
              key={count}
              value={String(count)}
              className={cn("flex-1", activeToggleClass)}
            >
              {count}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {players.length === MAX_PLAYERS && (
        <div className="space-y-2">
          <Label>Format</Label>
          <ToggleGroup
            className="w-full"
            variant="outline"
            spacing={2}
            aria-label="Format"
            value={[mode]}
            onValueChange={([next]) => {
              if (next === "ffa" || next === "teams") {
                setMode(next);
              }
            }}
          >
            <ToggleGroupItem value="ffa" className={cn("flex-1", activeToggleClass)}>
              Free-for-all
            </ToggleGroupItem>
            <ToggleGroupItem value="teams" className={cn("flex-1", activeToggleClass)}>
              Teams (2v2)
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-2">
        <Label>Names</Label>
        <div className="space-y-2">
          {players.map((player, index) => (
            <div key={player.id} className="flex items-center gap-2">
              <Input
                value={player.name}
                aria-label={`Name for player ${index + 1}`}
                onChange={(event) => renamePlayer(player.id, event.target.value)}
              />
              {teamsActive && (
                <TeamToggle
                  playerName={player.name}
                  team={player.team}
                  onChange={(team) => setPlayerTeam(player.id, team)}
                />
              )}
            </div>
          ))}
        </div>
        {teamsActive && !teamsBalanced && (
          <p className="text-muted-foreground text-xs">Put two players on each team for a 2v2.</p>
        )}
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
          Riftbound is first to 8 points (1vs1, 3/4 player FFA) and 11 points (2vs2).
        </p>
      </div>

      <Button size="lg" className="w-full" disabled={!canStart} onClick={() => startGame()}>
        <PlayIcon className="size-4" />
        Start game
      </Button>
    </div>
  );
}
