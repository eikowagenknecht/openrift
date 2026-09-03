import { formatDay } from "@openrift/shared";
import type { MetaOverlayQueueRow } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MetaEventCorrectionCard } from "@/components/admin/meta-event-correction-card";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import {
  DismissSourceKey,
  EventMatches,
  OverlayChanges,
} from "@/components/admin/meta-review-overlay-detail";
import { MetaReviewPlayerRow, PLAYER_ROW_COLUMNS } from "@/components/admin/meta-review-player-row";
import { ConfirmActionButton } from "@/components/admin/meta-review-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAcceptMetaEventOverlay,
  useAcceptMetaPlayerOverlays,
  useRejectMetaOverlay,
} from "@/hooks/use-admin-meta-overlays";
import type { MetaReviewGroup } from "@/lib/meta-review-queue";
import { bulkAcceptItems, triageOverlay } from "@/lib/meta-review-queue";
import { sourceProviderDisplay } from "@/lib/meta-source-review";

const READY_PREVIEW = 5;

function EventOverlayCard({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const accept = useAcceptMetaEventOverlay();
  const reject = useRejectMetaOverlay();
  const busy = accept.isPending || reject.isPending;
  const isProposal = overlay.metaEventId === null;
  const provider = sourceProviderDisplay(overlay.provider ?? "usersubmission");

  async function runAccept(metaEventId: string | null): Promise<void> {
    try {
      await accept.mutateAsync({ id: overlay.id, metaEventId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Applied.");
  }

  async function decline(): Promise<void> {
    try {
      await reject.mutateAsync({ kind: "event", id: overlay.id });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Rejected.");
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{isProposal ? "new event" : "event fields"}</Badge>
        <Badge variant={provider.variant}>{provider.label}</Badge>
        {overlay.submissionNote !== null && (
          <span className="text-muted-foreground text-sm italic">{overlay.submissionNote}</span>
        )}
      </div>
      <OverlayChanges changes={overlay.changes} />
      {isProposal && (
        <EventMatches
          overlayId={overlay.id}
          busy={busy}
          onAcceptInto={(metaEventId) => {
            void runAccept(metaEventId);
          }}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        {isProposal ? (
          <ConfirmActionButton
            title="Mint a new archived event?"
            description="Nothing links this proposal to an archived event, so accepting mints a second one for this tournament."
            confirmLabel="Mint a new event"
            onConfirm={() => runAccept(null)}
            disabled={busy}
            trigger={<Button variant="destructive" size="sm" />}
          >
            <CheckIcon />
            Accept as new
          </ConfirmActionButton>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              void runAccept(null);
            }}
          >
            <CheckIcon />
            Accept
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            void decline();
          }}
        >
          <XIcon />
          Reject
        </Button>
        <DismissSourceKey overlay={overlay} />
      </div>
    </div>
  );
}

function BulkAcceptButton({ group }: { group: MetaReviewGroup }) {
  const acceptAll = useAcceptMetaPlayerOverlays();
  const items = bulkAcceptItems(group.players);
  if (items.length === 0) {
    return null;
  }

  async function run(): Promise<void> {
    const result = await acceptAll.mutateAsync({ items });
    toast.success(`Accepted ${result.accepted} row${result.accepted === 1 ? "" : "s"}.`);
  }

  return (
    <ConfirmActionButton
      title={`Accept ${items.length} ready row${items.length === 1 ? "" : "s"}?`}
      description="Each exact match links to its standings row, every card name is already resolved, and the event is promoted once at the end."
      confirmLabel="Accept all"
      onConfirm={run}
      disabled={acceptAll.isPending}
      trigger={<Button size="sm" />}
    >
      <CheckIcon />
      Accept {items.length} ready
    </ConfirmActionButton>
  );
}

function visibleRows(players: MetaOverlayQueueRow[], showAll: boolean): MetaOverlayQueueRow[] {
  if (showAll) {
    return players;
  }
  const visible: MetaOverlayQueueRow[] = [];
  let readySeen = 0;
  for (const row of players) {
    if (triageOverlay(row) === "ready") {
      readySeen += 1;
      if (readySeen > READY_PREVIEW) {
        continue;
      }
    }
    visible.push(row);
  }
  return visible;
}

function PlayerRows({ players }: { players: MetaOverlayQueueRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = visibleRows(players, showAll);
  const hidden = players.length - visible.length;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Rank</TableHead>
          <TableHead>Player</TableHead>
          <TableHead>Standings row</TableHead>
          <TableHead className="w-32">Cards</TableHead>
          <TableHead className="w-16">Age</TableHead>
          <TableHead className="w-56" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => (
          <MetaReviewPlayerRow key={row.id} overlay={row} />
        ))}
        {hidden > 0 && (
          <TableRow>
            <TableCell colSpan={PLAYER_ROW_COLUMNS}>
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={() => {
                    setShowAll(true);
                  }}
                >
                  Show {hidden} more
                </Button>
                <span className="text-muted-foreground">
                  all ready: exact match, every name resolved
                </span>
              </span>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function MetaReviewEventGroup({ group }: { group: MetaReviewGroup }) {
  const [expanded, setExpanded] = useState(true);
  const decklists = group.players.length;

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <ExpandToggle
          expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.name}`}
          onClick={() => {
            setExpanded((open) => !open);
          }}
        >
          <span className="font-medium">{group.name}</span>
        </ExpandToggle>
        {group.eventDate !== null && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {formatDay(group.eventDate)}
          </span>
        )}
        {group.format !== null && <Badge variant="outline">{group.format}</Badge>}
        {group.providers.map((provider) => {
          const display = sourceProviderDisplay(provider);
          return (
            <Badge key={provider} variant={display.variant}>
              {display.label}
            </Badge>
          );
        })}
        <span className="text-muted-foreground text-sm">
          {decklists > 0 && `${decklists} decklist${decklists === 1 ? "" : "s"}`}
          {decklists > 0 && group.corrections.length > 0 && " · "}
          {group.corrections.length > 0 &&
            `${group.corrections.length} correction${group.corrections.length === 1 ? "" : "s"}`}
        </span>
        <span className="flex items-center gap-1.5">
          {group.counts.ready > 0 && decklists > 0 && (
            <Badge variant="success">{group.counts.ready} ready</Badge>
          )}
          {group.counts.needsRow > 0 && (
            <Badge variant="warning">
              {group.counts.needsRow} need{group.counts.needsRow === 1 ? "s" : ""} a row
            </Badge>
          )}
          {group.counts.unmatched > 0 && (
            <Badge variant="destructive">{group.counts.unmatched} unmatched</Badge>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <BulkAcceptButton group={group} />
          {group.metaEventId !== null && (
            <Button
              variant="outline"
              size="sm"
              render={<Link to="/admin/meta/$eventId" params={{ eventId: group.metaEventId }} />}
            >
              Open event
            </Button>
          )}
          {group.slug !== null && (
            <MetaPublicLinkButton
              href={`/meta/${group.slug}`}
              label={group.slug}
              ariaLabel={`Open ${group.name} on the public archive`}
              mono
            />
          )}
        </span>
      </div>

      {expanded && (
        <div className="border-t">
          {(group.proposal !== null ||
            group.eventPatches.length > 0 ||
            group.corrections.length > 0) && (
            <div className="space-y-2 p-4">
              {group.proposal !== null && <EventOverlayCard overlay={group.proposal} />}
              {group.eventPatches.map((overlay) => (
                <EventOverlayCard key={overlay.id} overlay={overlay} />
              ))}
              {group.corrections.map((correction) => (
                <MetaEventCorrectionCard key={correction.submission.id} correction={correction} />
              ))}
            </div>
          )}
          {group.players.length > 0 && <PlayerRows players={group.players} />}
        </div>
      )}
    </Card>
  );
}
