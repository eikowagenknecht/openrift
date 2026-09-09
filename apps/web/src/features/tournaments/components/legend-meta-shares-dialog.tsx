import type {
  GroupStageView,
  LegendMetaShareView,
} from "@openrift/shared/types/api/pod-tournament";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetLegendMetaShares } from "@/features/tournaments/hooks/use-tournament-run";
import { runReportedMutation } from "@/lib/run-reported-mutation";

/** Percent with at most one decimal, 0 to 100. */
function parseMetaShare(draft: string): number | null {
  const trimmed = draft.trim();
  if (!/^\d{1,3}(?:\.\d)?$/u.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return value >= 0 && value <= 100 ? value : null;
}

export function LegendMetaSharesDialog({
  id,
  pending,
  shares,
  open,
  onOpenChange,
}: {
  id: string;
  pending: GroupStageView["pendingMetaShares"];
  shares: LegendMetaShareView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setShares = useSetLegendMetaShares();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const key = pending.map((entry) => entry.legendCardId).join(",");
  if (open && seededKey !== key) {
    const stored = new Map(shares.map((share) => [share.legendCardId, share.share]));
    setSeededKey(key);
    setDrafts(
      Object.fromEntries(
        pending.map((entry) => [
          entry.legendCardId,
          stored.has(entry.legendCardId) ? String(stored.get(entry.legendCardId)) : "",
        ]),
      ),
    );
  }

  const parsed = pending.map((entry) => parseMetaShare(drafts[entry.legendCardId] ?? ""));
  const complete = parsed.every((value) => value !== null);

  async function save() {
    const entries = pending.flatMap((entry) => {
      const value = parseMetaShare(drafts[entry.legendCardId] ?? "");
      return value === null ? [] : [{ legendCardId: entry.legendCardId, share: value }];
    });
    if (entries.length !== pending.length) {
      return;
    }
    await runReportedMutation(() => setShares.mutateAsync({ id, shares: entries }));
    setSeededKey(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void save()}>
          <DialogHeader>
            <DialogTitle>
              Enter meta shares for {pending.length} Legend{pending.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Enter the current meta share of each Legend from the source you use; the lower share
              ranks higher. The numbers stay in this tournament and are not shown anywhere else.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {pending.map((entry) => (
              <div key={entry.legendCardId} className="flex items-center justify-between gap-3">
                <Label htmlFor={`meta-${entry.legendCardId}`} className="min-w-0 truncate">
                  {entry.legendName ?? entry.legendCardId}
                </Label>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Input
                    id={`meta-${entry.legendCardId}`}
                    inputMode="decimal"
                    value={drafts[entry.legendCardId] ?? ""}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [entry.legendCardId]: event.target.value,
                      }))
                    }
                    className="w-20 tabular-nums"
                    aria-label={`Meta share for ${entry.legendName ?? entry.legendCardId}`}
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!complete || setShares.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
