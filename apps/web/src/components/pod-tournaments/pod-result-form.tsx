import type { PodResponse } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PodResultFormProps {
  pod: PodResponse;
  onSubmit: (placements: { playerId: string; placement: number }[]) => Promise<void> | void;
  submitting: boolean;
  onCancel?: () => void;
}

/**
 * Placement selector for one pod. Each player gets a 1..N place; ties are entered
 * by giving two players the same place. Points are always derived server-side, so
 * they are never typed here. The same form serves the organizer and the
 * participant link.
 * @returns The result-entry form.
 */
export function PodResultForm({ pod, onSubmit, submitting, onCancel }: PodResultFormProps) {
  const [places, setPlaces] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pod.members.map((member) => [
        member.playerId,
        member.placement === null ? "" : String(member.placement),
      ]),
    ),
  );
  const items = Array.from({ length: pod.size }, (_, index) => {
    const value = String(index + 1);
    return { value, label: value };
  });
  const allSet = pod.members.every((member) => places[member.playerId]);

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
      {pod.members.map((member) => (
        <div key={member.playerId} className="flex items-center justify-between gap-3">
          <span className="font-medium">{member.displayName}</span>
          <Select
            items={items}
            value={places[member.playerId] ?? ""}
            onValueChange={(next) =>
              setPlaces((prev) => ({ ...prev, [member.playerId]: next ?? "" }))
            }
          >
            <SelectTrigger className="w-24">
              <SelectValue placeholder="Place" />
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
