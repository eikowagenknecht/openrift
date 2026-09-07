import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerSeededState } from "@/hooks/use-server-seeded-state";
import { useUpdateTournament } from "@/hooks/use-tournaments";

export function PointsCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const isSwiss = detail.pairingStyle === "swiss";
  const [winText, setWinText] = useServerSeededState(String(detail.winPoints));
  const [drawText, setDrawText] = useServerSeededState(String(detail.drawPoints));
  const [byeText, setByeText] = useServerSeededState(String(detail.byePoints));

  const parsePoints = (text: string): number | null => {
    if (!/^\d{1,2}$/u.test(text.trim())) {
      return null;
    }
    return Number(text.trim());
  };
  const win = parsePoints(winText);
  const draw = parsePoints(drawText);
  const bye = parsePoints(byeText);
  const invalid = bye === null || (isSwiss && (win === null || draw === null));
  const changed =
    bye !== detail.byePoints ||
    (isSwiss && (win !== detail.winPoints || draw !== detail.drawPoints));

  async function save() {
    if (invalid) {
      return;
    }
    // Built before the try block: the React Compiler cannot lower conditional
    // value blocks inside try/catch and would bail out of this component.
    const patch = {
      id: detail.id,
      byePoints: bye ?? undefined,
      winPoints: isSwiss ? (win ?? undefined) : undefined,
      drawPoints: isSwiss ? (draw ?? undefined) : undefined,
    };
    try {
      await updateTournament.mutateAsync(patch);
      toast.success("Points updated");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <Card id="points" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Points</CardTitle>
        <CardDescription>
          {isSwiss
            ? "Points a match win, a draw, and a bye are worth. Changing these recalculates the standings of played rounds too."
            : "Points a bye (sitting a round out) is worth. Changing this recalculates the standings of played rounds too."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          {isSwiss ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-win-points">Win</Label>
                <Input
                  id="t-win-points"
                  value={winText}
                  disabled={locked}
                  inputMode="numeric"
                  className="w-20 tabular-nums"
                  aria-label="Points for a match win"
                  onChange={(event) => setWinText(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="t-draw-points">Draw</Label>
                <Input
                  id="t-draw-points"
                  value={drawText}
                  disabled={locked}
                  inputMode="numeric"
                  className="w-20 tabular-nums"
                  aria-label="Points for a draw"
                  onChange={(event) => setDrawText(event.target.value)}
                />
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-bye-points">Bye</Label>
            <Input
              id="t-bye-points"
              value={byeText}
              disabled={locked}
              inputMode="numeric"
              className="w-20 tabular-nums"
              aria-label="Points for a bye"
              onChange={(event) => setByeText(event.target.value)}
            />
          </div>
          <Button
            disabled={locked || invalid || !changed || updateTournament.isPending}
            onClick={() => void save()}
          >
            Save
          </Button>
        </div>
        {invalid ? (
          <span className="text-destructive mt-2 block text-sm">
            Points must be whole numbers between 0 and 99.
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
