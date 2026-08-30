import type { MetaCandidateQueueRow } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArchiveXIcon, CheckIcon, RefreshCwIcon, UndoIcon, UploadIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
import { CandidateStateBadge, ConfirmActionButton } from "@/components/admin/meta-candidate-shared";
import { MetaCandidateUploadDialog } from "@/components/admin/meta-candidate-upload-dialog";
import { MetaIgnoredCandidatesDialog } from "@/components/admin/meta-ignored-candidates-dialog";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import {
  PageDescription,
  PageTopBarButton,
  PageTopBarPrimaryButton,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useAdminMetaCandidates,
  useCheckMetaCandidateEvent,
  useIgnoreMetaCandidateEvent,
  useRematchMetaCandidates,
} from "@/hooks/use-admin-meta-candidates";
import { useDeckFormatList } from "@/hooks/use-enums";
import { candidateProviderDisplay, sortCandidateQueue } from "@/lib/meta-candidate-review";

function ProviderCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row) {
    return null;
  }
  const provider = candidateProviderDisplay(row.provider);
  return <Badge variant={provider.variant}>{provider.label}</Badge>;
}

function NameCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row) {
    return null;
  }
  return (
    <Link
      to="/admin/meta/candidates/$candidateId"
      params={{ candidateId: row.id }}
      className="font-medium hover:underline"
    >
      {row.name}
    </Link>
  );
}

function DateCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row) {
    return null;
  }
  // Already a date-only ISO string; shown verbatim so the queue matches the
  // externalId-style identifiers the sources use.
  return <span className="tabular-nums">{row.eventDate}</span>;
}

function FormatCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  const { labels } = useDeckFormatList();
  if (!row) {
    return null;
  }
  // A candidate's format is whatever the source wrote, so it may name no known
  // format at all — a boundary value, not an enum slug.
  return <span className="text-muted-foreground">{labels[row.format] ?? row.format}</span>;
}

function PlayersCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row) {
    return null;
  }
  return (
    <span className="tabular-nums">
      {row.playerRowCount}
      {row.unacceptedPlayerCount > 0 && (
        <span className="text-muted-foreground"> ({row.unacceptedPlayerCount} pending)</span>
      )}
    </span>
  );
}

function StateCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CandidateStateBadge state={row.state} />
      {row.linkedSourceCount > 1 && (
        <Badge variant="sky" title="Several candidates feed the same live event">
          {row.linkedSourceCount} sources
        </Badge>
      )}
      {row.unresolvedCardCount > 0 && (
        <Badge variant="destructive">{row.unresolvedCardCount} unmatched</Badge>
      )}
      {row.checkedAt !== null && <Badge variant="muted">Reviewed</Badge>}
    </div>
  );
}

function LiveEventCell({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  if (!row?.metaEventSlug) {
    return null;
  }
  return (
    <MetaPublicLinkButton
      href={`/meta/${row.metaEventSlug}`}
      label={row.metaEventSlug}
      ariaLabel={`Open ${row.name} on the public archive`}
      mono
    />
  );
}

const columns: AdminColumnDef<MetaCandidateQueueRow>[] = [
  { header: "Source", width: "w-32", sortValue: (row) => row.provider, cell: <ProviderCell /> },
  { header: "Event", sortValue: (row) => row.name, cell: <NameCell /> },
  { header: "Date", sortValue: (row) => row.eventDate, cell: <DateCell /> },
  { header: "Format", sortValue: (row) => row.format, cell: <FormatCell /> },
  {
    header: "Players",
    align: "right",
    sortValue: (row) => row.playerRowCount,
    cell: <PlayersCell />,
  },
  { header: "State", sortValue: (row) => row.state, cell: <StateCell /> },
  { header: "Live event", cell: <LiveEventCell /> },
];

function CandidateRowActions({ row }: AdminCellSlotProps<MetaCandidateQueueRow>) {
  const checkEvent = useCheckMetaCandidateEvent();
  const ignoreEvent = useIgnoreMetaCandidateEvent();
  if (!row) {
    return null;
  }
  const reviewed = row.checkedAt !== null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        render={<Link to="/admin/meta/candidates/$candidateId" params={{ candidateId: row.id }} />}
      >
        Review
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={checkEvent.isPending}
        onClick={() => checkEvent.mutate({ id: row.id, checked: !reviewed })}
      >
        {reviewed ? <UndoIcon /> : <CheckIcon />}
        {reviewed ? "Unmark" : "Mark reviewed"}
      </Button>
      <ConfirmActionButton
        title={`Ignore "${row.name}"?`}
        description="The staged event and its decks are deleted, and future uploads skip this key until you unignore it."
        confirmLabel="Ignore"
        onConfirm={() => ignoreEvent.mutateAsync({ id: row.id })}
      >
        <ArchiveXIcon />
        Ignore
      </ConfirmActionButton>
    </>
  );
}

/**
 * The Meta Archive's candidate review queue (ADR-014). Rows are ordered the way
 * they are worked — everything unreviewed first, newest event date first inside
 * that — and reviewed rows are hidden by default, because an in-sync reviewed
 * candidate is exactly the noise the queue exists to keep out of view.
 *
 * @returns The review tab.
 */
export function MetaCandidatesPage() {
  const { data } = useAdminMetaCandidates();
  const rematch = useRematchMetaCandidates();
  const [showReviewed, setShowReviewed] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  const visible = sortCandidateQueue(
    showReviewed ? data.candidates : data.candidates.filter((row) => row.checkedAt === null),
  );
  const hiddenCount = data.candidates.length - visible.length;

  async function handleRematch() {
    let result: { examined: number; updated: number; resolved: number };
    try {
      result = await rematch.mutateAsync();
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Rematched ${result.examined} staged decks`, {
      description: `${result.updated} decks changed, ${result.resolved} card names newly resolved.`,
    });
  }

  return (
    <>
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <>
            <PageTopBarButton onClick={() => setIgnoredOpen(true)}>Ignored…</PageTopBarButton>
            <PageTopBarButton onClick={handleRematch} disabled={rematch.isPending}>
              <RefreshCwIcon />
              Rematch cards
            </PageTopBarButton>
            <PageTopBarPrimaryButton onClick={() => setUploadOpen(true)}>
              <UploadIcon />
              Upload JSON
            </PageTopBarPrimaryButton>
          </>
        }
      />

      <AdminTable
        columns={columns}
        data={visible}
        getRowKey={(row) => row.id}
        emptyText={
          data.candidates.length === 0
            ? "No candidates. Upload a JSON file or push with an API key."
            : "Nothing left to review. Turn on 'Show reviewed' to see the rest."
        }
        toolbar={
          <div className="space-y-3">
            <PageDescription>
              The work queue: everything the sync staged, or a player submitted, that a human still
              has to look at. Nothing reaches the public archive until it is accepted here, and the
              chips on each row say why it is waiting.
            </PageDescription>
            <div className="flex items-center gap-2">
              <Switch
                id="meta-candidates-show-reviewed"
                checked={showReviewed}
                onCheckedChange={(checked: boolean) => setShowReviewed(checked)}
              />
              <Label htmlFor="meta-candidates-show-reviewed">
                Show reviewed
                {hiddenCount > 0 && (
                  <span className="text-muted-foreground"> ({hiddenCount} hidden)</span>
                )}
              </Label>
            </div>
          </div>
        }
        actions={<CandidateRowActions />}
      />

      {uploadOpen && <MetaCandidateUploadDialog onClose={() => setUploadOpen(false)} />}
      {ignoredOpen && <MetaIgnoredCandidatesDialog onClose={() => setIgnoredOpen(false)} />}
    </>
  );
}
