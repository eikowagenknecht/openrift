import type { PodResponse, TournamentMatchFormat } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { swissPointsPreview, swissResultPresets } from "@/lib/swiss-results";
import { groupPodMembersByTeam, teamDisplayName } from "@/lib/team-display";
import { cn } from "@/lib/utils";

interface SwissResultFormProps {
  /**
   * The match: a 2-player pod (1v1 Swiss) or a 4-player team pod (2v2). The
   * first side of the scorelines is members[0]'s side.
   */
  pod: PodResponse;
  /** Treat the pod as a 2v2 team match (two sides of two players each). */
  teamMatch?: boolean;
  matchFormat: TournamentMatchFormat;
  winPoints: number;
  drawPoints: number;
  onSubmit: (results: { playerId: string; gamePoints: number }[]) => Promise<void> | void;
  submitting: boolean;
  onCancel?: () => void;
}

/**
 * Result entry for one Swiss match — 1v1 or a 2v2 team match: pick a scoreline
 * preset (from the first side's perspective), preview the match points, save.
 * In 2v2 each side's score fans out to both of its players (a team shares one
 * result). The same form serves the organizer and the participant link.
 * @returns The match result-entry form.
 */
export function SwissResultForm({
  pod,
  teamMatch = false,
  matchFormat,
  winPoints,
  drawPoints,
  onSubmit,
  submitting,
  onCancel,
}: SwissResultFormProps) {
  const groups = teamMatch ? groupPodMembersByTeam(pod.members) : pod.members.map((m) => [m]);
  const [side1, side2] = groups;
  const side1Name = side1 ? teamDisplayName(side1.map((m) => m.displayName)) : "";
  const side2Name = side2 ? teamDisplayName(side2.map((m) => m.displayName)) : "";
  const presets = swissResultPresets(matchFormat);
  const stored1 = side1?.[0]?.gamePoints ?? null;
  const stored2 = side2?.[0]?.gamePoints ?? null;
  const storedIndex = presets.findIndex(
    (preset) =>
      stored1 !== null &&
      stored2 !== null &&
      preset.gamePoints[0] === stored1 &&
      preset.gamePoints[1] === stored2,
  );
  const [selected, setSelected] = useState<number | null>(storedIndex === -1 ? null : storedIndex);
  const chosen = selected === null ? null : (presets[selected] ?? null);
  const preview = chosen ? swissPointsPreview(chosen.gamePoints, winPoints, drawPoints) : null;

  async function handleSubmit() {
    if (!chosen || !side1 || !side2) {
      return;
    }
    await onSubmit([
      ...side1.map((member) => ({ playerId: member.playerId, gamePoints: chosen.gamePoints[0] })),
      ...side2.map((member) => ({ playerId: member.playerId, gamePoints: chosen.gamePoints[1] })),
    ]);
  }

  if (!side1 || !side2 || groups.length !== 2) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-medium">{side1Name}</span> vs{" "}
        <span className="font-medium">{side2Name}</span>
        <span className="text-muted-foreground"> · scores read {side1Name}&apos;s games first</span>
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
          {side1Name} +{preview[0]} · {side2Name} +{preview[1]}
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
