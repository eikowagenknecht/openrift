import { formatRelativeTime } from "@openrift/shared";
import type { MetaOverlayQueueRow } from "@openrift/shared";
import { CheckIcon, LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  DismissSourceKey,
  OverlayCardLines,
  OverlayChanges,
  PlayerMatches,
  SubmissionLedger,
} from "@/components/admin/meta-review-overlay-detail";
import { ConfirmActionButton, rankLabel } from "@/components/admin/meta-review-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAcceptMetaPlayerOverlay, useRejectMetaOverlay } from "@/hooks/use-admin-meta-overlays";
import { sourceProviderDisplay } from "@/lib/meta-source-review";

export const PLAYER_ROW_COLUMNS = 6;

function StandingsCell({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const match = overlay.match;
  if (match === null) {
    return null;
  }
  const target =
    match.playerName === null ? null : (
      <span>
        <span className="text-muted-foreground tabular-nums">
          #{rankLabel(match.rank, match.rankIsTier)}
        </span>{" "}
        {match.playerName}
      </span>
    );
  switch (match.state) {
    case "linked": {
      return (
        <>
          <Badge variant="muted">
            <LinkIcon />
            linked
          </Badge>
          {target}
        </>
      );
    }
    case "exact": {
      return (
        <>
          <Badge variant="success">exact match</Badge>
          {target}
          <span className="text-muted-foreground text-xs">links on accept</span>
        </>
      );
    }
    case "candidates": {
      return (
        <>
          <Badge variant="warning">
            {match.candidateCount} candidate{match.candidateCount === 1 ? "" : "s"}
          </Badge>
          <span className="text-muted-foreground text-xs">pick one below</span>
        </>
      );
    }
    case "none": {
      return (
        <>
          <Badge variant="warning">no row</Badge>
          <span className="text-muted-foreground text-xs">accepting files a new one</span>
        </>
      );
    }
    case "unscored": {
      return <Badge variant="muted">accept the event first</Badge>;
    }
  }
}

function CardsCell({ overlay }: { overlay: MetaOverlayQueueRow }) {
  if (overlay.unresolvedNames.length > 0) {
    return <Badge variant="destructive">{overlay.unresolvedNames.length} unmatched</Badge>;
  }
  if (overlay.cards.length === 0) {
    return <span className="text-muted-foreground">no decklist</span>;
  }
  return (
    <span className="flex items-center gap-1.5">
      <CheckIcon className="text-success size-3.5" />
      {overlay.cards.length} line{overlay.cards.length === 1 ? "" : "s"}
    </span>
  );
}

export function MetaReviewPlayerRow({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const accept = useAcceptMetaPlayerOverlay();
  const reject = useRejectMetaOverlay();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busy = accept.isPending || reject.isPending;

  const name = overlay.playerName ?? "Standings entry";
  const state = overlay.match?.state ?? "unscored";
  const mints = state === "none" || state === "candidates";
  const provider = sourceProviderDisplay(overlay.provider ?? "usersubmission");
  const unmatched =
    overlay.unresolvedNames.length === 0
      ? ""
      : ` ${String(overlay.unresolvedNames.length)} card${overlay.unresolvedNames.length === 1 ? "" : "s"} match nothing in the catalog, so it lands without a decklist.`;

  async function runAccept(): Promise<void> {
    const metaEventPlayerId = state === "exact" ? (overlay.match?.metaEventPlayerId ?? null) : null;
    try {
      await accept.mutateAsync({ id: overlay.id, metaEventPlayerId });
    } catch {
      setConfirming(false);
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Applied.");
  }

  // A list with names the catalog does not know lands as a row without a deck,
  // which is easy to do by accident and hard to notice after.
  function onAccept(): void {
    if (overlay.unresolvedNames.length > 0 && !confirming) {
      setConfirming(true);
      setExpanded(true);
      return;
    }
    void runAccept();
  }

  async function decline(): Promise<void> {
    try {
      await reject.mutateAsync({ kind: "player", id: overlay.id });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Rejected.");
  }

  return (
    <>
      <TableRow data-state={expanded ? "open" : undefined}>
        <TableCell className="text-muted-foreground w-12 tabular-nums">
          {rankLabel(overlay.rank, overlay.rankIsTier)}
        </TableCell>
        <TableCell className="max-w-64">
          <ExpandToggle
            expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
            className="w-full min-w-0"
            onClick={() => {
              setExpanded((open) => !open);
            }}
          >
            <span className="truncate font-medium">{name}</span>
            {overlay.provider === null && (
              <Badge variant={provider.variant}>{provider.label}</Badge>
            )}
          </ExpandToggle>
        </TableCell>
        <TableCell className="whitespace-normal">
          <span className="flex flex-wrap items-center gap-2">
            <StandingsCell overlay={overlay} />
          </span>
        </TableCell>
        <TableCell className="w-32">
          <CardsCell overlay={overlay} />
        </TableCell>
        <TableCell className="text-muted-foreground w-16">
          {formatRelativeTime(new Date(overlay.createdAt))}
        </TableCell>
        <TableCell className="w-56">
          <span className="flex items-center justify-end gap-1.5">
            {state === "unscored" ? null : mints ? (
              <ConfirmActionButton
                title="File a new standings row?"
                description={`Nothing links this entry to a standings row, so accepting files a new one. The row the source published stays as it is, and the event ends up with two entries for this finish.${unmatched}`}
                confirmLabel="File a new row"
                onConfirm={runAccept}
                disabled={busy}
                trigger={<Button variant="outline" size="sm" />}
              >
                <CheckIcon />
                Accept as new row
              </ConfirmActionButton>
            ) : (
              <Button size="sm" onClick={onAccept} disabled={busy}>
                <CheckIcon />
                {confirming ? "Accept without a deck" : "Accept"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void decline();
              }}
              disabled={busy}
            >
              <XIcon />
              Reject
            </Button>
          </span>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/40">
          <TableCell colSpan={PLAYER_ROW_COLUMNS} className="p-4 whitespace-normal">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              <div className="space-y-3">
                {overlay.submissionNote !== null && (
                  <p className="text-muted-foreground italic">{overlay.submissionNote}</p>
                )}
                {confirming && (
                  <p className="text-muted-foreground text-sm">
                    {overlay.unresolvedNames.length} card
                    {overlay.unresolvedNames.length === 1 ? "" : "s"} match nothing, so this lands
                    as a standings row with no decklist.
                  </p>
                )}
                <OverlayCardLines overlay={overlay} />
              </div>
              <div className="space-y-4">
                <PlayerMatches overlay={overlay} />
                <div className="space-y-2">
                  <span className="font-medium">Changes</span>
                  <OverlayChanges changes={overlay.changes} />
                </div>
                <DismissSourceKey overlay={overlay} />
                <SubmissionLedger overlay={overlay} />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
