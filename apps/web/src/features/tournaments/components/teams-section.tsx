import type { TournamentParticipantResponse } from "@openrift/shared/types/api/tournament";
import { TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/components/ui/card-list";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";
import { useCreateTeam, useDissolveTeam } from "@/features/tournaments/hooks/use-tournaments";
import { teamDisplayName } from "@/features/tournaments/lib/team-display";

/**
 * The 2v2 team roster. Dissolving is only possible until the team has played
 * a round; the server enforces it and its errors surface as toasts here.
 */
export function TeamsSection({
  id,
  participants,
  manage,
}: {
  id: string;
  participants: TournamentParticipantResponse[];
  manage: boolean;
}) {
  const createTeam = useCreateTeam();
  const dissolveTeam = useDissolveTeam();
  const [firstId, setFirstId] = useState<string>("");
  const [secondId, setSecondId] = useState<string>("");

  const roster = participants.filter(
    (participant) => participant.status === "active" || participant.status === "dropped",
  );
  const byTeam = new Map<string, TournamentParticipantResponse[]>();
  for (const participant of roster) {
    if (participant.teamId === null) {
      continue;
    }
    const members = byTeam.get(participant.teamId) ?? [];
    members.push(participant);
    byTeam.set(participant.teamId, members);
  }
  const teams = [...byTeam.entries()].map(([teamId, members]) => ({
    teamId,
    members,
    dropped: members.every((member) => member.status === "dropped"),
  }));
  const unteamed = participants.filter(
    (participant) => participant.status === "active" && participant.teamId === null,
  );
  const [soleUnteamed, ...otherUnteamed] = unteamed;
  const pickable = (excludeId: string) => unteamed.filter((player) => player.id !== excludeId);

  async function handleCreate() {
    if (!firstId || !secondId || firstId === secondId) {
      return;
    }
    try {
      await createTeam.mutateAsync({ id, participantIds: [firstId, secondId] });
      setFirstId("");
      setSecondId("");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  async function handleDissolve(teamId: string, name: string) {
    try {
      await dissolveTeam.mutateAsync({ id, teamId });
      toast.success(`Dissolved ${name}`);
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionHeading icon={UsersIcon} count={teams.length}>
        Teams
      </SectionHeading>
      {teams.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No teams yet. Pair two players below; every active player needs a team before round 1 can
          be paired.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {teams.map((team) => {
            const name = teamDisplayName(team.members.map((member) => member.displayName));
            return (
              <CardRow key={team.teamId} className={team.dropped ? "opacity-50" : undefined}>
                <span className="flex min-w-0 items-center gap-2">
                  <UserAvatar name={name} size="sm" />
                  <span className="truncate font-medium">{name}</span>
                  {team.dropped ? (
                    <span className="text-muted-foreground shrink-0 text-sm">(dropped)</span>
                  ) : null}
                </span>
                {manage ? (
                  <ChipRemoveButton
                    aria-label={`Dissolve ${name}`}
                    onClick={() => void handleDissolve(team.teamId, name)}
                  />
                ) : null}
              </CardRow>
            );
          })}
        </ul>
      )}
      {unteamed.length > 0 ? (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {soleUnteamed !== undefined && otherUnteamed.length === 0
              ? `${soleUnteamed.displayName} has no team yet.`
              : `${unteamed.length} players have no team yet: ${unteamed
                  .map((player) => player.displayName)
                  .join(", ")}.`}{" "}
            Every active player needs a team (or a bye) before a round can be paired.
          </AlertTitle>
        </Alert>
      ) : null}
      {manage && unteamed.length >= 2 ? (
        <div className="flex flex-wrap items-end gap-2">
          <TeamMemberPicker
            label="First player"
            value={firstId}
            players={pickable(secondId)}
            onChange={setFirstId}
          />
          <TeamMemberPicker
            label="Second player"
            value={secondId}
            players={pickable(firstId)}
            onChange={setSecondId}
          />
          <Button
            size="sm"
            disabled={!firstId || !secondId || firstId === secondId || createTeam.isPending}
            onClick={() => void handleCreate()}
          >
            Pair as team
          </Button>
        </div>
      ) : null}
      {manage && unteamed.length === 1 ? (
        <p className="text-muted-foreground text-sm">One player is waiting for a partner.</p>
      ) : null}
    </section>
  );
}

function TeamMemberPicker({
  label,
  value,
  players,
  onChange,
}: {
  label: string;
  value: string;
  players: TournamentParticipantResponse[];
  onChange: (value: string) => void;
}) {
  const items = players.map((player) => ({ value: player.id, label: player.displayName }));
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <Select items={items} value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger className="w-48" aria-label={label}>
          <SelectValue placeholder="Pick a player" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function unteamedActivePlayers(
  participants: readonly TournamentParticipantResponse[],
): TournamentParticipantResponse[] {
  return participants.filter(
    (participant) => participant.status === "active" && participant.teamId === null,
  );
}

/** Participants without a team, or whose partner left the roster, are absent from the map. */
export function teammateNamesById(
  participants: readonly TournamentParticipantResponse[],
): Map<string, string> {
  const names = new Map<string, string>();
  for (const participant of participants) {
    if (participant.teamId === null) {
      continue;
    }
    const teammate = participants.find(
      (other) => other.teamId === participant.teamId && other.id !== participant.id,
    );
    if (teammate) {
      names.set(participant.id, teammate.displayName);
    }
  }
  return names;
}
