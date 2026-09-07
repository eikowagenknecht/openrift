import type { PodPlayerResponse, PodStandingRow } from "@openrift/shared/types/api/pod-tournament";
import type { TournamentPlayMode } from "@openrift/shared/types/api/tournament";
import { Link } from "@tanstack/react-router";
import { RotateCcwIcon, TriangleAlertIcon, UserMinusIcon, UserXIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ActionBand } from "@/components/ui/action-band";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/user-avatar";
import {
  useGenerateTournamentRound,
  useParticipantAction,
} from "@/features/tournaments/hooks/use-tournaments";
import { teamDisplayName } from "@/features/tournaments/lib/team-display";

export function GenerateRoundControls({
  id,
  players,
  standings,
  isFirstRound,
  nextRoundNumber,
  reachedSuggestion,
  suggested,
  swissAutoBye = false,
  playMode = "1v1",
  missingRegionIds = [],
}: {
  id: string;
  players: PodPlayerResponse[];
  standings: PodStandingRow[];
  isFirstRound: boolean;
  nextRoundNumber: number;
  reachedSuggestion: boolean;
  suggested: number;
  swissAutoBye?: boolean;
  playMode?: TournamentPlayMode;
  missingRegionIds?: string[];
}) {
  const generateRound = useGenerateTournamentRound();
  const participantAction = useParticipantAction();
  const [byeIds, setByeIds] = useState<string[]>([]);

  const teamMode = playMode === "2v2";
  const activePlayers = players.filter((player) => player.status === "active");
  const droppedPlayers = players.filter((player) => player.status === "dropped");
  const byeCountById = new Map(standings.map((row) => [row.playerId, row.byeCount]));
  const nameById = new Map(players.map((player) => [player.id, player.displayName]));

  const byeUnits: { key: string; label: string; memberIds: [string, ...string[]] }[] = [];
  if (teamMode) {
    const byTeam = new Map<string, PodPlayerResponse[]>();
    for (const player of activePlayers) {
      if (player.teamId === null) {
        byeUnits.push({ key: player.id, label: player.displayName, memberIds: [player.id] });
        continue;
      }
      const members = byTeam.get(player.teamId) ?? [];
      members.push(player);
      byTeam.set(player.teamId, members);
    }
    for (const [teamId, members] of byTeam) {
      const [lead, ...rest] = members;
      if (lead === undefined) {
        continue;
      }
      byeUnits.push({
        key: teamId,
        label: teamDisplayName(members.map((member) => member.displayName)),
        memberIds: [lead.id, ...rest.map((member) => member.id)],
      });
    }
  } else {
    for (const player of activePlayers) {
      byeUnits.push({ key: player.id, label: player.displayName, memberIds: [player.id] });
    }
  }
  const unitChecked = (unit: { memberIds: string[] }) =>
    unit.memberIds.every((memberId) => byeIds.includes(memberId));
  const selectedUnits = byeUnits.filter((unit) => unitChecked(unit));
  const repeatByeUnits = selectedUnits.filter(
    (unit) => (byeCountById.get(unit.memberIds[0]) ?? 0) >= 1,
  );

  // The server rejects a pairing that seats a region-less player, so mirror
  // that here: byed players are exempt, everyone else needs a region first.
  const seatedWithoutRegion = missingRegionIds.filter((playerId) => !byeIds.includes(playerId));
  const seatedWithoutTeam = teamMode
    ? activePlayers
        .filter((player) => player.teamId === null && !byeIds.includes(player.id))
        .map((player) => player.id)
    : [];
  const seatedCount = activePlayers.length - byeIds.length;
  const blocked = seatedWithoutRegion.length > 0 || seatedWithoutTeam.length > 0;

  function toggleByeUnit(unit: { memberIds: string[] }) {
    setByeIds((current) =>
      unit.memberIds.every((memberId) => current.includes(memberId))
        ? current.filter((byeId) => !unit.memberIds.includes(byeId))
        : [...current.filter((byeId) => !unit.memberIds.includes(byeId)), ...unit.memberIds],
    );
  }

  // Dropping is immediate, unlike a bye: it applies straight away, not staged
  // until the round is generated.
  async function setDropped(player: PodPlayerResponse, dropped: boolean) {
    // Resolved before the try: React Compiler cannot lower a conditional that
    // sits inside a try/catch.
    const action = dropped ? "drop" : "reactivate";
    const message = dropped ? `Dropped ${player.displayName}` : `${player.displayName} is back in`;
    // A dropped player can't be seated, so they can't hold a bye either. In
    // 2v2 the server drops the whole team, so the teammate's bye goes too.
    const goneIds =
      teamMode && player.teamId !== null
        ? players.filter((row) => row.teamId === player.teamId).map((row) => row.id)
        : [player.id];
    try {
      await participantAction.mutateAsync({ id, participantId: player.id, action });
      if (dropped) {
        setByeIds((current) => current.filter((byeId) => !goneIds.includes(byeId)));
      }
      toast.success(message);
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  async function generate() {
    try {
      await generateRound.mutateAsync({ id, byes: byeIds });
      setByeIds([]);
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <ActionBand
      icon={UserMinusIcon}
      accent
      label={`Round ${nextRoundNumber}`}
      value={teamMode ? Math.floor(seatedCount / 2) : seatedCount}
      sub={
        suggested > 0
          ? `${teamMode ? "teams" : "players"} to pair · round ${nextRoundNumber} of ~${suggested}`
          : `${teamMode ? "teams" : "players"} to pair`
      }
      action={
        <Button disabled={generateRound.isPending || blocked} onClick={() => void generate()}>
          {isFirstRound ? "Generate round 1" : "Generate next round"}
        </Button>
      }
    >
      {/* Kept open while every player is dropped: that is exactly when the
          organizer needs the drop picker to bring someone back. */}
      {activePlayers.length > 0 || droppedPlayers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {activePlayers.length > 0 ? (
            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                <UserMinusIcon />
                {selectedUnits.length === 0
                  ? teamMode
                    ? "Sit teams out"
                    : "Sit players out"
                  : `Sitting out ${selectedUnits.length}`}
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder={teamMode ? "Search teams..." : "Search players..."} />
                  <CommandList>
                    <CommandEmpty>
                      {teamMode ? "No teams found." : "No players found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {byeUnits.map((unit) => {
                        const priorByes = byeCountById.get(unit.memberIds[0]) ?? 0;
                        return (
                          <CommandItem
                            key={unit.key}
                            // The key keeps the search value unique when two units
                            // share a display name; cmdk still matches on the name.
                            value={`${unit.label} ${unit.key}`}
                            data-checked={unitChecked(unit)}
                            onSelect={() => toggleByeUnit(unit)}
                          >
                            <UserAvatar name={unit.label} size="sm" />
                            <span className="truncate">{unit.label}</span>
                            {priorByes > 0 ? (
                              <Badge variant="warning">
                                {priorByes} bye{priorByes === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : null}
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <UserXIcon />
              Drop players
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search players..." />
                <CommandList>
                  <CommandEmpty>No players found.</CommandEmpty>
                  <CommandGroup heading="Active">
                    {activePlayers.map((player) => (
                      <CommandItem
                        key={player.id}
                        value={`${player.displayName} ${player.id}`}
                        disabled={participantAction.isPending}
                        onSelect={() => void setDropped(player, true)}
                      >
                        <UserAvatar name={player.displayName} size="sm" />
                        {/* CommandItem appends its own ml-auto CheckIcon; a second ml-auto here
                            would split the slack between the two icons. */}
                        <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
                        <UserXIcon className="text-muted-foreground size-4" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {droppedPlayers.length > 0 ? (
                    <CommandGroup heading="Dropped">
                      {droppedPlayers.map((player) => (
                        <CommandItem
                          key={player.id}
                          value={`${player.displayName} ${player.id}`}
                          disabled={participantAction.isPending}
                          onSelect={() => void setDropped(player, false)}
                        >
                          <UserAvatar name={player.displayName} size="sm" className="opacity-50" />
                          <span className="text-muted-foreground min-w-0 flex-1 truncate">
                            {player.displayName}
                          </span>
                          <RotateCcwIcon className="text-muted-foreground size-4" />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedUnits.map((unit) => (
            <Badge key={unit.key} variant="secondary">
              {unit.label}
              <ChipRemoveButton
                aria-label={`Don't sit ${unit.label} out`}
                onClick={() => toggleByeUnit(unit)}
              />
            </Badge>
          ))}
        </div>
      ) : null}
      {repeatByeUnits.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {repeatByeUnits.map((unit) => unit.label).join(", ")}{" "}
            {repeatByeUnits.length === 1 ? "has" : "have"} already had a bye.
          </AlertTitle>
        </Alert>
      ) : null}
      {seatedWithoutRegion.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {seatedWithoutRegion.map((playerId) => nameById.get(playerId) ?? "A player").join(", ")}{" "}
            {seatedWithoutRegion.length === 1 ? "has" : "have"} no region yet. Set regions on the{" "}
            <Link to="/tournaments/$id/participants" params={{ id }}>
              Participants page
            </Link>{" "}
            (or sit them out) before pairing.
          </AlertTitle>
        </Alert>
      ) : null}
      {seatedWithoutTeam.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {seatedWithoutTeam.map((playerId) => nameById.get(playerId) ?? "A player").join(", ")}{" "}
            {seatedWithoutTeam.length === 1 ? "is" : "are"} not on a team yet. Pair them on the{" "}
            <Link to="/tournaments/$id/participants" params={{ id }}>
              Participants page
            </Link>{" "}
            (or sit them out) before pairing.
          </AlertTitle>
        </Alert>
      ) : null}
      {swissAutoBye ? (
        <p className="text-muted-foreground text-sm">
          {teamMode
            ? "With an odd number of teams, the lowest-ranked team with the fewest byes sits out automatically. Pick byes above to override."
            : "The lowest-ranked player with the fewest byes sits out. Pick byes above to override."}
        </p>
      ) : null}
      {reachedSuggestion ? (
        <p className="text-muted-foreground text-sm">
          Suggested {suggested} rounds reached. End the tournament in Settings, or keep going.
        </p>
      ) : null}
    </ActionBand>
  );
}
