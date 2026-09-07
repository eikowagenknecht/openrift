import { UploadIcon } from "lucide-react";
import { useState } from "react";

import { PageDescription, PageTopBarButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { MetaIgnoredSourcesDialog } from "@/features/admin/components/meta-ignored-sources-dialog";
import { MetaOverlayUploadDialog } from "@/features/admin/components/meta-overlay-upload-dialog";
import { MetaReviewEventGroup } from "@/features/admin/components/meta-review-event-group";
import { useAdminMetaOverlays } from "@/features/admin/hooks/use-admin-meta-overlays";
import { useMetaEventCorrections } from "@/features/admin/hooks/use-admin-meta-submissions";
import type { MetaReviewTriage } from "@/features/meta/lib/meta-review-queue";
import {
  META_REVIEW_TRIAGE,
  META_REVIEW_TRIAGE_LABELS,
  filterGroup,
  groupReviewQueue,
  sumTriageCounts,
  totalTriageCount,
} from "@/features/meta/lib/meta-review-queue";

function TriageChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      variant={active ? "secondary" : "outline"}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      <Badge variant={active ? "count" : "muted"}>{count}</Badge>
    </Button>
  );
}

export function MetaOverlaysPage() {
  const { data } = useAdminMetaOverlays();
  const corrections = useMetaEventCorrections();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);
  const [picked, setPicked] = useState<MetaReviewTriage | null>(null);

  const groups = groupReviewQueue(data.overlays, corrections.data?.items ?? []);
  const counts = sumTriageCounts(groups);
  const total = totalTriageCount(counts);
  // A filter whose last row was just settled falls back to the whole queue.
  const triage = picked !== null && counts[picked] > 0 ? picked : null;
  const shown =
    triage === null
      ? groups
      : groups.map((group) => filterGroup(group, triage)).filter((group) => group !== null);

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Review"
        actions={
          <>
            <PageTopBarButton
              onClick={() => {
                setIgnoredOpen(true);
              }}
            >
              Dismissed keys
            </PageTopBarButton>
            <PageTopBarButton
              onClick={() => {
                setUploadOpen(true);
              }}
            >
              <UploadIcon />
              Upload
            </PageTopBarButton>
          </>
        }
      />
      <PageDescription>
        Corrections and decklists that sources and contributors have proposed, grouped by the event
        they land on. Accepting one re-promotes its event, so the patch lands and everything else
        stays as the sources published it.
      </PageDescription>

      {total === 0 ? (
        <p className="text-muted-foreground">Nothing waiting.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <TriageChip
              active={triage === null}
              count={total}
              onClick={() => {
                setPicked(null);
              }}
            >
              All
            </TriageChip>
            {META_REVIEW_TRIAGE.filter((key) => counts[key] > 0).map((key) => (
              <TriageChip
                key={key}
                active={triage === key}
                count={counts[key]}
                onClick={() => {
                  setPicked(key);
                }}
              >
                {META_REVIEW_TRIAGE_LABELS[key]}
              </TriageChip>
            ))}
          </div>
          {corrections.data?.hasMore === true && (
            <p className="text-muted-foreground text-sm">
              Only the oldest corrections are shown. Close some out and the rest appear.
            </p>
          )}
          <div className="space-y-3">
            {shown.map((group) => (
              <MetaReviewEventGroup key={group.key} group={group} />
            ))}
          </div>
        </>
      )}

      {uploadOpen && (
        <MetaOverlayUploadDialog
          onClose={() => {
            setUploadOpen(false);
          }}
        />
      )}
      {ignoredOpen && (
        <MetaIgnoredSourcesDialog
          onClose={() => {
            setIgnoredOpen(false);
          }}
        />
      )}
    </div>
  );
}
