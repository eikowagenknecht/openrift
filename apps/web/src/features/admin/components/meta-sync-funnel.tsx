import type { MetaSource, MetaSyncStatus } from "@openrift/shared/contracts/admin/meta-catalog";
import { formatRelativeTime } from "@openrift/shared/format-date";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

import type { MetaAdminTarget } from "@/features/admin/lib/meta-admin-triggers";
import { catalogueSource } from "@/features/admin/lib/meta-admin-triggers";
import { META_SOURCE_LABELS } from "@/features/meta/lib/meta-catalog-display";

function FunnelStage({
  label,
  value,
  detail,
  source,
  target,
}: {
  label: string;
  value: number;
  detail: string;
  source: MetaSource;
  target: MetaAdminTarget;
}) {
  return (
    <Link
      from="/admin/meta"
      to="/admin/meta"
      search={(prev) => ({ ...prev, source: catalogueSource(source), ...target })}
      className="hover:bg-muted/50 focus-visible:ring-ring block flex-1 rounded-md border px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-muted-foreground text-sm">{detail}</div>
    </Link>
  );
}

function FunnelArrow() {
  return <ArrowRightIcon className="text-muted-foreground hidden shrink-0 self-center lg:block" />;
}

export function SyncFunnel({
  source,
  status,
  pendingReview,
  unresolvedCards,
}: {
  source: MetaSource;
  status: MetaSyncStatus;
  pendingReview: number;
  unresolvedCards: number;
}) {
  const { catalog, archive, counts } = status;
  return (
    <div className="flex flex-col gap-2 lg:flex-row">
      <FunnelStage
        source={source}
        label="Untriaged"
        value={counts.new}
        detail={`of ${catalog.total.toLocaleString()} catalogued`}
        target={{ tab: "catalogue" }}
      />
      <FunnelArrow />
      <FunnelStage
        source={source}
        label="Awaiting results"
        value={catalog.acceptedAwaitingResults}
        detail={`${catalog.dueRecheck.toLocaleString()} rechecks due`}
        target={{ tab: "catalogue", triage: "accepted", awaitingResults: true }}
      />
      <FunnelArrow />
      {/* The queue itself is cross-source, so the stage names the source its
          count is scoped to; the Review tab's own badge counts every source. */}
      <FunnelStage
        source={source}
        label={`Needs review from ${META_SOURCE_LABELS[source]}`}
        value={pendingReview}
        detail={`${unresolvedCards.toLocaleString()} unmatched card names`}
        target={{ tab: "review" }}
      />
      <FunnelArrow />
      <FunnelStage
        source={source}
        label="Published"
        value={archive.events}
        detail={`${archive.decks.toLocaleString()} decks · ${archive.eventsWithDecklists.toLocaleString()} of ${catalog.decklistPublished.toLocaleString()} events with lists`}
        target={{ tab: "public" }}
      />
    </div>
  );
}

export function MirrorLine({ status }: { status: MetaSyncStatus }) {
  const { catalog } = status;
  const lastCrawl =
    catalog.lastSeenAt === null
      ? "never crawled"
      : `last crawl ${formatRelativeTime(catalog.lastSeenAt)}`;
  return (
    <p className="text-muted-foreground text-sm">
      Mirror: {catalog.total.toLocaleString()} events, {catalog.completed.toLocaleString()} ran,{" "}
      {lastCrawl}.
    </p>
  );
}
