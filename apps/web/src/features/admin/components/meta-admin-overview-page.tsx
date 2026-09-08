import type { MetaSource, MetaSyncStatus } from "@openrift/shared/contracts/admin/meta-catalog";
import type { MetaOverlayQueueRow } from "@openrift/shared/types/api/meta";

import { PageDescription } from "@/components/layout/page-top-bar";
import { SectionHeading } from "@/components/ui/section-heading";
import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { ArchiveJobsCard } from "@/features/admin/components/meta-archive-jobs-card";
import { HealthCard } from "@/features/admin/components/meta-health-card";
import type { SourcedAlert } from "@/features/admin/components/meta-health-card";
import { MirrorLine, SyncFunnel } from "@/features/admin/components/meta-sync-funnel";
import { TriggersCard } from "@/features/admin/components/meta-triggers-card";
import { RefreshCountdownButton } from "@/features/admin/components/refresh-countdown-button";
import {
  SYNC_STATUS_POLL_MS,
  useMetaSyncStatus,
} from "@/features/admin/hooks/use-admin-meta-catalog";
import { useAdminMetaOverlays } from "@/features/admin/hooks/use-admin-meta-overlays";
import { BACKFILL_KIND } from "@/features/admin/lib/meta-admin-triggers";
import {
  backfillDisplay,
  META_SOURCE_LABELS,
  metaSyncAlerts,
  overlayCountsForProvider,
} from "@/features/meta/lib/meta-catalog-display";

export function MetaSourceSyncSection({ source }: { source: MetaSource }) {
  const { data } = useMetaSyncStatus(source);
  const overlays = useAdminMetaOverlays();

  const { pendingReview, unresolvedCards } = overlayCountsForProvider(
    overlays.data.overlays,
    source,
  );

  return (
    <section aria-label={META_SOURCE_LABELS[source]} className="space-y-4">
      <SectionHeading>{META_SOURCE_LABELS[source]}</SectionHeading>
      {data === undefined ? (
        <p className="text-muted-foreground">Loading the sync status…</p>
      ) : (
        <>
          <SyncFunnel
            source={source}
            status={data}
            pendingReview={pendingReview}
            unresolvedCards={unresolvedCards}
          />
          <MirrorLine status={data} />
        </>
      )}

      <TriggersCard
        source={source}
        schedules={data?.schedules ?? {}}
        runs={data?.runs ?? []}
        backfill={backfillDisplay(data?.runs ?? [], BACKFILL_KIND[source])}
        pendingTriage={data?.counts.new ?? null}
      />
    </section>
  );
}

function sourceAlerts(
  source: MetaSource,
  status: MetaSyncStatus | undefined,
  overlays: readonly MetaOverlayQueueRow[],
  now: Date,
): SourcedAlert[] {
  if (status === undefined) {
    return [];
  }
  const { unresolvedCards } = overlayCountsForProvider(overlays, source);
  return metaSyncAlerts(status, unresolvedCards, now).map((alert) => ({ ...alert, source }));
}

export function MetaAdminOverviewPage() {
  const uvsgames = useMetaSyncStatus("uvsgames");
  const playloltcg = useMetaSyncStatus("playloltcg");
  const topdeck = useMetaSyncStatus("topdeck");
  const overlays = useAdminMetaOverlays();

  const now = new Date();
  const alerts = [
    ...sourceAlerts("uvsgames", uvsgames.data, overlays.data.overlays, now),
    ...sourceAlerts("playloltcg", playloltcg.data, overlays.data.overlays, now),
    ...sourceAlerts("topdeck", topdeck.data, overlays.data.overlays, now),
  ];

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <RefreshCountdownButton
            onRefresh={() => {
              void uvsgames.refetch();
              void playloltcg.refetch();
              void topdeck.refetch();
            }}
            isFetching={uvsgames.isFetching || playloltcg.isFetching || topdeck.isFetching}
            dataUpdatedAt={Math.min(
              uvsgames.dataUpdatedAt,
              playloltcg.dataUpdatedAt,
              topdeck.dataUpdatedAt,
            )}
            intervalMs={SYNC_STATUS_POLL_MS}
          />
        }
      />
      <PageDescription>
        Event data is read from each source&apos;s public API. The crawl reads only the event
        overview; standings and decklists are fetched separately, and only for accepted events.
      </PageDescription>

      <HealthCard alerts={alerts} />
      <MetaSourceSyncSection source="uvsgames" />
      <MetaSourceSyncSection source="playloltcg" />
      <MetaSourceSyncSection source="topdeck" />

      <section aria-label="The archive" className="space-y-4">
        <SectionHeading>The archive</SectionHeading>
        <ArchiveJobsCard />
      </section>
    </div>
  );
}
