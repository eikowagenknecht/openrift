import type { PodPlayerResponse, PodStandingRow, TournamentPlayMode } from "@openrift/shared";
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
import { useGenerateTournamentRound, useParticipantAction } from "@/hooks/use-tournaments";
import { teamDisplayName } from "@/lib/team-display";

/**
 * The next round's state band: the "generate" action plus an optional bye
 * picker. The organizer can sit active players out (a manual bye, worth
 * win-equivalent points); the rest are paired. This is also how an otherwise
 * unrepresentable field (1, 2, or 5 active players) is resolved.
 *
 * The picker is a searchable popover rather than a chip per player — a 40-player
 * event turned the old toggle group into a wall — with the chosen byes echoed as
 * removable chips so the selection stays visible with the popover shut.
 *
 * @param id The tournament id.
 * @param players The roster (only active players can be byed).
 * @param standings Standings rows, used to flag a player who has already byed.
 * @param isFirstRound Whether no rounds exist yet (button label).
 * @param nextRoundNumber The round this generates.
 * @param reachedSuggestion Whether the Swiss-suggested round count is met.
 * @param suggested The suggested round count (for the nudge text).
 * @param swissAutoBye Whether odd fields auto-bye a player (Swiss mode hint).
 * @param missingRegionIds Active players without a region on a region-aware
 *   tournament; generating is blocked while any of them would be seated.
 * @returns The generate controls.
 */
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
  /** 2v2: byes sit out whole teams, and unteamed players block pairing. */
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

  // What the bye picker offers: whole teams in 2v2 (a bye covers both members;
  // an unteamed player can still be sat out alone), individual players in 1v1.
  const byeUnits: { key: string; label: string; memberIds: string[] }[] = [];
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
      byeUnits.push({
        key: teamId,
        label: teamDisplayName(members.map((member) => member.displayName)),
        memberIds: members.map((member) => member.id),
      });
    }
  } else {
    byeUnits.push(
      ...activePlayers.map((player) => ({
        key: player.id,
        label: player.displayName,
        memberIds: [player.id],
      })),
    );
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
  // Likewise for 2v2: every seated player must be on a team.
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

  // Dropping is immediate, not staged like a bye: a player who has left the
  // venue is out of the event, not out of the next pairing, and the organizer
  // may be dropping them after the final round. Matches the participants page,
  // which drops straight from its row menu (only Remove confirms).
  async function setDropped(player: PodPlayerResponse, dropped: boolean) {
    try {
      await participantAction.mutateAsync({
        id,
        participantId: player.id,
        action: dropped ? "drop" : "reactivate",
      });
      if (dropped) {
        // A dropped player can't be seated, so they can't hold a bye either. In
        // 2v2 the server drops the whole team, so the teammate's bye goes too.
        const goneIds =
          teamMode && player.teamId !== null
            ? players.filter((row) => row.teamId === player.teamId).map((row) => row.id)
            : [player.id];
        setByeIds((current) => current.filter((byeId) => !goneIds.includes(byeId)));
      }
      toast.success(dropped ? `Dropped ${player.displayName}` : `${player.displayName} is back in`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Couldn't ${dropped ? "drop" : "reactivate"} ${player.displayName}`,
      );
    }
  }

  async function generate() {
    try {
      await generateRound.mutateAsync({ id, byes: byeIds });
      setByeIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate round");
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
          {/* Dropping sits beside sitting out because they are the same
              question at the table ("who isn't playing this round?") with
              different answers: a bye is for this round, a drop is for good.
              Sending the organizer to the Participants page for the second one
              breaks the flow mid-event. */}
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
                        {/* flex-1 rather than ml-auto on the icon: CommandItem
                            appends its own ml-auto CheckIcon, and two auto
                            margins split the slack between them, so the icon
                            drifted with the name's length. */}
                        <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
                        <UserXIcon className="text-muted-foreground size-4" />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {/* Dropped players stay listed so a mis-tap is undone where
                      it happened, rather than on another page. */}
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
            : "With an odd number of players, the lowest-ranked player with the fewest byes sits out automatically. Pick byes above to override."}
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
