import type { PodResponse, PodScoringScheme } from "@openrift/shared";
import { pointsForPlacements } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface PodResultFormProps {
  pod: PodResponse;
  /** The active scheme, so the live points preview matches what will be scored. */
  scheme: PodScoringScheme;
  onSubmit: (placements: { playerId: string; placement: number }[]) => Promise<void> | void;
  submitting: boolean;
  onCancel?: () => void;
}

// Points can be fractional (a tied placement averages, e.g. 1.5); show one decimal only then.
function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/**
 * Placement selector for one pod. Each player picks a 1..N place from a linked
 * toggle-button group; ties are entered by giving two players the same place.
 * Once every player has a place the derived points (with tie averaging) preview
 * live next to each name. Points are still computed server-side on save, never
 * typed. The same form serves the organizer and the participant link.
 * @returns The result-entry form.
 */
export function PodResultForm({ pod, scheme, onSubmit, submitting, onCancel }: PodResultFormProps) {
  const [places, setPlaces] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pod.members.map((member) => [
        member.playerId,
        member.placement === null ? "" : String(member.placement),
      ]),
    ),
  );
  const slots = Array.from({ length: pod.size }, (_, index) => String(index + 1));
  const allSet = pod.members.every((member) => places[member.playerId]);
  const previewPoints = allSet
    ? pointsForPlacements(
        pod.members.map((member) => Number(places[member.playerId])),
        pod.size,
        scheme,
      )
    : null;

  async function handleSubmit() {
    if (!allSet) {
      return;
    }
    await onSubmit(
      pod.members.map((member) => ({
        playerId: member.playerId,
        placement: Number(places[member.playerId]),
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pod.members.map((member, index) => (
        <div
          key={member.playerId}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5"
        >
          <span className="flex items-center gap-2">
            <span className="font-medium">{member.displayName}</span>
            {previewPoints ? (
              <span className="text-muted-foreground tabular-nums">
                +{formatPoints(previewPoints[index] ?? 0)}
              </span>
            ) : null}
          </span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={`Place for ${member.displayName}`}
            value={places[member.playerId] ? [places[member.playerId]] : []}
            onValueChange={([next]) =>
              setPlaces((prev) => ({ ...prev, [member.playerId]: next ?? "" }))
            }
          >
            {slots.map((slot) => (
              <ToggleGroupItem key={slot} value={slot} className="min-w-9 tabular-nums">
                {slot}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
      <p className="text-muted-foreground">
        Tie two players by giving them the same place. Points are worked out automatically.
      </p>
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
