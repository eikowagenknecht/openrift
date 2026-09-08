import { PlayIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LegendPickerDialog } from "@/features/match-tracker/components/legend-picker";
import type { TrackedLegend } from "@/features/match-tracker/lib/match-legends";
import type { TeamId } from "@/features/match-tracker/stores/match-tracker-store";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  teamMemberCounts,
  useMatchTrackerStore,
} from "@/features/match-tracker/stores/match-tracker-store";
import { TEAM_LABELS } from "@/features/tournaments/lib/match-teams";
import { useNumericDraft } from "@/hooks/use-numeric-draft";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const PLAYER_COUNT_OPTIONS = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, offset) => MIN_PLAYERS + offset,
);

const TEAM_OPTIONS: TeamId[] = [0, 1];

// Overrides the base toggle's muted active state to keep the prior variant="default" Button look.
const activeToggleClass =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

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
      spacing={0}
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

function SeatRow({
  playerId,
  index,
  name,
  legend,
  team,
  teamsActive,
  onRename,
  onTeamChange,
}: {
  playerId: string;
  index: number;
  name: string;
  legend: TrackedLegend | null;
  team: TeamId;
  teamsActive: boolean;
  onRename: (name: string) => void;
  onTeamChange: (team: TeamId) => void;
}) {
  const setLegend = useMatchTrackerStore((state) => state.setLegend);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Pressable
        aria-label={
          legend ? `Change ${name}'s legend, currently ${legend.name}` : `Pick a legend for ${name}`
        }
        onClick={() => setPickerOpen(true)}
        className={cn(
          "aspect-card relative h-14 shrink-0 overflow-hidden rounded-md border",
          legend ? "border-border-accent" : "border-border border-dashed",
        )}
      >
        {legend?.thumbnail ? (
          <img
            src={legend.thumbnail}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground grid size-full place-items-center">
            <PlusIcon className="size-4" />
          </span>
        )}
      </Pressable>
      <Input
        value={name}
        aria-label={`Name for player ${index + 1}`}
        onChange={(event) => onRename(event.target.value)}
      />
      {teamsActive && <TeamToggle playerName={name} team={team} onChange={onTeamChange} />}
      <LegendPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        playerName={name}
        selectedCardId={legend?.cardId ?? null}
        onSelect={(next) => setLegend(playerId, next)}
      />
    </div>
  );
}

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

  const { inputProps: pointsTargetProps, resetDraft: resetPointsTargetDraft } = useNumericDraft({
    display: String(pointsTarget),
    onCommit: (text) => {
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an input value; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(text, 10);
      if (!Number.isNaN(parsed)) {
        setPointsTarget(parsed);
      }
    },
  });

  const teamsActive = mode === "teams" && players.length === MAX_PLAYERS;
  const [teamOneCount, teamTwoCount] = teamMemberCounts(players);
  const teamsBalanced = teamOneCount === 2 && teamTwoCount === 2;
  const canStart = !teamsActive || teamsBalanced;

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Match tracker</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "space-y-6 px-3 pt-3 pb-6")}>
        <PageDescription>
          Keep score and XP for everyone at the table on one device.
        </PageDescription>

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
                  resetPointsTargetDraft();
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
          <Label>Seats</Label>
          <div className="space-y-2">
            {players.map((player, index) => (
              <SeatRow
                key={player.id}
                playerId={player.id}
                index={index}
                name={player.name}
                legend={player.legend}
                team={player.team}
                teamsActive={teamsActive}
                onRename={(name) => renamePlayer(player.id, name)}
                onTeamChange={(team) => setPlayerTeam(player.id, team)}
              />
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            A legend is optional. It sets the art and colors on that player&apos;s side of the
            board.
          </p>
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
            {...pointsTargetProps}
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
    </>
  );
}
