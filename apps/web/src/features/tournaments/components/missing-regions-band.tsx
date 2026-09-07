import type { TournamentParticipantResponse } from "@openrift/shared/types/api/tournament";
import { GlobeIcon } from "lucide-react";

import { ActionBand } from "@/components/ui/action-band";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ParticipantTarget } from "@/features/tournaments/components/participant-row";

// Holds real buttons, so no `render` prop: a nested anchor would be invalid HTML.
export function MissingRegionsBand({
  players,
  onSetRegion,
}: {
  players: TournamentParticipantResponse[];
  onSetRegion: (target: ParticipantTarget & { region: string }) => void;
}) {
  return (
    <ActionBand
      icon={GlobeIcon}
      accent
      label="Missing regions"
      value={players.length}
      sub={`${players.length === 1 ? "player blocks" : "players block"} region-aware pairing`}
    >
      <div className="flex flex-col gap-2">
        {players.map((player) => (
          <div
            key={player.id}
            className="bg-muted flex items-center gap-2.5 rounded-lg px-2.5 py-2"
          >
            <UserAvatar name={player.userName ?? player.displayName} className="size-7 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {player.displayName}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                onSetRegion({
                  participantId: player.id,
                  name: player.displayName,
                  region: "none",
                })
              }
            >
              <GlobeIcon className="size-4" />
              Set region
            </Button>
          </div>
        ))}
      </div>
    </ActionBand>
  );
}
