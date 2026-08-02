import type { TournamentDetailResponse } from "@openrift/shared";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpdateTournament } from "@/hooks/use-tournaments";

/**
 * Per-player region tracking, which feeds both the pairing engine and the
 * standings leaderboard. 2v2 has no region axis, so the tab hides this card
 * entirely in that mode.
 * @returns The regions card.
 */
export function RegionsCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();

  async function toggle(checked: boolean) {
    try {
      await updateTournament.mutateAsync({ id: detail.id, regionsEnabled: checked });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <Card id="regions" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Regions</CardTitle>
        <CardDescription>
          Track a region per player. Pairings avoid same-region matchups, and standings add a
          per-region leaderboard. Judges assign regions on the Participants tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Switch
            id="t-regions"
            checked={detail.regionsEnabled}
            disabled={locked || updateTournament.isPending}
            onCheckedChange={(checked) => void toggle(checked)}
          />
          <Label htmlFor="t-regions">Track player regions</Label>
        </div>
      </CardContent>
    </Card>
  );
}
