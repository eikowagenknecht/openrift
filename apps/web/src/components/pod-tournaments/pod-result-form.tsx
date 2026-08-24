import type { PodResponse, PodScoringScheme } from "@openrift/shared";
import { placementsFromGamePoints, pointsForPlacements } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ordinalPlace } from "@/lib/tournament-display";

interface PodResultFormProps {
  pod: PodResponse;
  /** The active scheme, so the live points preview matches what will be scored. */
  scheme: PodScoringScheme;
  onSubmit: (results: { playerId: string; gamePoints: number }[]) => Promise<void> | void;
  submitting: boolean;
  onCancel?: () => void;
}

// Scheme points can be fractional (a tied place averages, e.g. 1.75); show up to two decimals
// then, so a value like 1.75 isn't rounded down to 1.8.
function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : Number(points.toFixed(2)).toString();
}

/**
 * Parse a controlled points input back to a whole, non-negative game-point count.
 * @returns The parsed count, or `null` when blank/invalid.
 */
export function parsePoints(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Result entry for one pod. Each player's raw game points are typed (in Riftbound
 * a game is won at 8 points; more is possible if a turn overshoots). Once every
 * player has a value, the derived placement and scheme points (with tie averaging)
 * preview live next to each name; the server re-derives both on save. The same
 * form serves the organizer and the participant link.
 * @returns The result-entry form.
 */
export function PodResultForm({ pod, scheme, onSubmit, submitting, onCancel }: PodResultFormProps) {
  const [points, setPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pod.members.map((member) => [
        member.playerId,
        member.gamePoints === null ? "" : String(member.gamePoints),
      ]),
    ),
  );
  // Server values at open (or last sync). The round views poll while reporting, so
  // someone else's save can land mid-edit — the mismatch surfaces a notice below
  // instead of being silently overwritten on save.
  const [serverBaseline, setServerBaseline] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(pod.members.map((member) => [member.playerId, member.gamePoints])),
  );
  const changedRemotely = pod.members.some(
    (member) => serverBaseline[member.playerId] !== member.gamePoints,
  );
  const parsed = pod.members.map((member) => parsePoints(points[member.playerId] ?? ""));

  function loadLatest() {
    setServerBaseline(
      Object.fromEntries(pod.members.map((member) => [member.playerId, member.gamePoints])),
    );
    setPoints(
      Object.fromEntries(
        pod.members.map((member) => [
          member.playerId,
          member.gamePoints === null ? "" : String(member.gamePoints),
        ]),
      ),
    );
  }
  const allSet = parsed.every((value) => value !== null);
  const placements = allSet ? placementsFromGamePoints(parsed as number[]) : null;
  // Swiss matches (size 2) use SwissResultForm instead; the placement tables
  // only exist for 3/4-pods, so guard the preview accordingly.
  const previewPoints =
    placements && pod.size !== 2 ? pointsForPlacements(placements, pod.size, scheme) : null;

  async function handleSubmit() {
    if (!allSet) {
      return;
    }
    await onSubmit(
      pod.members.map((member, index) => ({
        playerId: member.playerId,
        gamePoints: parsed[index] as number,
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pod.members.map((member, index) => (
        // No flex-wrap: a long name used to push the points field onto its own
        // line, breaking the column of inputs the organizer is typing down.
        // The name truncates instead — it is the one part that can give.
        <div key={member.playerId} className="flex items-center justify-between gap-x-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium" title={member.displayName}>
              {member.displayName}
            </span>
            {previewPoints && placements ? (
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {ordinalPlace(placements[index] ?? 1)} · +{formatPoints(previewPoints[index] ?? 0)}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Label htmlFor={`pts-${member.playerId}`} className="text-muted-foreground">
              Points
            </Label>
            <Input
              id={`pts-${member.playerId}`}
              type="number"
              min={0}
              inputMode="numeric"
              value={points[member.playerId] ?? ""}
              onChange={(event) =>
                setPoints((prev) => ({ ...prev, [member.playerId]: event.target.value }))
              }
              className="w-20 tabular-nums"
            />
          </span>
        </div>
      ))}
      <p className="text-muted-foreground">
        Game points per player (8 wins, more is possible). Places are worked out automatically.
      </p>
      {changedRemotely ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-amber-600 dark:text-amber-500">
          <span>Someone else saved scores for this pod while you were editing.</span>
          <Button variant="outline" size="sm" onClick={loadLatest}>
            Show latest
          </Button>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button onClick={handleSubmit} disabled={!allSet || submitting}>
          {submitting ? "Saving…" : "Save result"}
        </Button>
      </div>
    </div>
  );
}
