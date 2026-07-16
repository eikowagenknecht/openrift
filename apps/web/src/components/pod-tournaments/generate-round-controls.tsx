import type { PodPlayerResponse, PodStandingRow } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGenerateTournamentRound } from "@/hooks/use-tournaments";

/**
 * The "generate next round" control plus an optional bye picker. The organizer
 * can sit active players out (a manual bye, worth win-equivalent points); the
 * rest are paired. This is also how an otherwise unrepresentable field (1, 2, or
 * 5 active players) is resolved.
 *
 * @param id The tournament id.
 * @param players The roster (only active players can be byed).
 * @param standings Standings rows, used to flag a player who has already byed.
 * @param isFirstRound Whether no rounds exist yet (button label).
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
  reachedSuggestion,
  suggested,
  swissAutoBye = false,
  missingRegionIds = [],
}: {
  id: string;
  players: PodPlayerResponse[];
  standings: PodStandingRow[];
  isFirstRound: boolean;
  reachedSuggestion: boolean;
  suggested: number;
  swissAutoBye?: boolean;
  missingRegionIds?: string[];
}) {
  const generateRound = useGenerateTournamentRound();
  const [byeIds, setByeIds] = useState<string[]>([]);

  const activePlayers = players.filter((player) => player.status === "active");
  const byeCountById = new Map(standings.map((row) => [row.playerId, row.byeCount]));
  const repeatByes = byeIds.filter((playerId) => (byeCountById.get(playerId) ?? 0) >= 1);
  const nameById = new Map(players.map((player) => [player.id, player.displayName]));
  // The server rejects a pairing that seats a region-less player, so mirror
  // that here: byed players are exempt, everyone else needs a region first.
  const seatedWithoutRegion = missingRegionIds.filter((playerId) => !byeIds.includes(playerId));

  async function generate() {
    try {
      await generateRound.mutateAsync({ id, byes: byeIds });
      setByeIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate round");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {activePlayers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-sm">Sit players out (bye), optional</span>
          <ToggleGroup
            multiple
            variant="outline"
            size="sm"
            spacing={1}
            className="flex-wrap"
            value={byeIds}
            onValueChange={setByeIds}
            aria-label="Players to bye this round"
          >
            {activePlayers.map((player) => (
              <ToggleGroupItem key={player.id} value={player.id}>
                {player.displayName}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {repeatByes.length > 0 ? (
            <span className="text-sm text-amber-600 dark:text-amber-500">
              {repeatByes.map((playerId) => nameById.get(playerId) ?? "A player").join(", ")}{" "}
              {repeatByes.length === 1 ? "has" : "have"} already had a bye.
            </span>
          ) : null}
          {swissAutoBye ? (
            <span className="text-muted-foreground text-sm">
              With an odd number of players, the lowest-ranked player with the fewest byes sits out
              automatically. Pick byes above to override.
            </span>
          ) : null}
        </div>
      ) : null}
      {seatedWithoutRegion.length > 0 ? (
        <span className="text-sm text-amber-600 dark:text-amber-500">
          {seatedWithoutRegion.map((playerId) => nameById.get(playerId) ?? "A player").join(", ")}{" "}
          {seatedWithoutRegion.length === 1 ? "has" : "have"} no region yet. Set regions on the{" "}
          <Link
            to="/tournaments/$id/participants"
            params={{ id }}
            className="underline underline-offset-2"
          >
            Participants page
          </Link>{" "}
          (or sit them out) before pairing.
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={generateRound.isPending || seatedWithoutRegion.length > 0}
          onClick={() => void generate()}
        >
          {isFirstRound ? "Generate round 1" : "Generate next round"}
        </Button>
        {reachedSuggestion ? (
          <span className="text-muted-foreground text-sm">
            Suggested {suggested} rounds reached. End the tournament in Settings, or keep going.
          </span>
        ) : null}
      </div>
    </div>
  );
}
