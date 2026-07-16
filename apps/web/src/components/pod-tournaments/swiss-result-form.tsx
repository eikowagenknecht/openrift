import type { PodResponse, TournamentMatchFormat } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { swissPointsPreview, swissResultPresets } from "@/lib/swiss-results";
import { cn } from "@/lib/utils";

interface SwissResultFormProps {
  /** The match (a 2-player pod); members[0] is player 1 of the scorelines. */
  pod: PodResponse;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  onSubmit: (results: { playerId: string; gamePoints: number }[]) => Promise<void> | void;
  submitting: boolean;
  onCancel?: () => void;
}

/**
 * Result entry for one Swiss match: pick a scoreline preset (from player 1's
 * perspective), preview the match points, save. The same form serves the
 * organizer and the participant link.
 * @returns The match result-entry form.
 */
export function SwissResultForm({
  pod,
  matchFormat,
  winPoints,
  drawPoints,
  onSubmit,
  submitting,
  onCancel,
}: SwissResultFormProps) {
  const [player1, player2] = pod.members;
  const presets = swissResultPresets(matchFormat);
  const storedIndex = presets.findIndex(
    (preset) =>
      player1?.gamePoints !== null &&
      player2?.gamePoints !== null &&
      preset.gamePoints[0] === player1?.gamePoints &&
      preset.gamePoints[1] === player2?.gamePoints,
  );
  const [selected, setSelected] = useState<number | null>(storedIndex === -1 ? null : storedIndex);
  const chosen = selected === null ? null : (presets[selected] ?? null);
  const preview = chosen ? swissPointsPreview(chosen.gamePoints, winPoints, drawPoints) : null;

  async function handleSubmit() {
    if (!chosen || !player1 || !player2) {
      return;
    }
    await onSubmit([
      { playerId: player1.playerId, gamePoints: chosen.gamePoints[0] },
      { playerId: player2.playerId, gamePoints: chosen.gamePoints[1] },
    ]);
  }

  if (!player1 || !player2) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{player1.displayName}</span> vs{" "}
        <span className="font-medium">{player2.displayName}</span>
        <span className="text-muted-foreground">
          {" "}
          · scores read {player1.displayName}&apos;s games first
        </span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset, index) => (
          <Button
            key={preset.label}
            variant={selected === index ? "default" : "outline"}
            size="sm"
            className={cn("tabular-nums")}
            onClick={() => setSelected(index)}
            disabled={submitting}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {preview ? (
        <p className="text-muted-foreground text-sm tabular-nums">
          {player1.displayName} +{preview[0]} · {player2.displayName} +{preview[1]}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button onClick={handleSubmit} disabled={selected === null || submitting}>
          {submitting ? "Saving…" : "Save result"}
        </Button>
      </div>
    </div>
  );
}
