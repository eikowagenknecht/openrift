import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { MetaOverlayQueueRow } from "@openrift/shared";
import { formatDayTime, formatRelativeTime } from "@openrift/shared";
import type { JobStatus } from "@openrift/shared/contracts/admin/job-runs";
import type {
  MetaCancellableJob,
  MetaCatalogTriage,
  MetaSource,
  MetaSyncStatus,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, CircleAlertIcon, PlayIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { JobStatusBadge } from "@/components/admin/job-status-badge";
import { announceSyncTrigger } from "@/components/admin/meta-catalog-shared";
import { RefreshCountdownButton } from "@/components/admin/refresh-countdown-button";
import { PageDescription } from "@/components/layout/page-top-bar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogForm } from "@/components/ui/dialog-form";
import { SectionHeading } from "@/components/ui/section-heading";
import type { MetaSyncTrigger } from "@/hooks/use-admin-meta-catalog";
import {
  SYNC_STATUS_POLL_MS,
  useCancelMetaRun,
  useMetaArchiveJobs,
  useMetaSyncStatus,
  useRunMetaSync,
} from "@/hooks/use-admin-meta-catalog";
import { useAdminMetaOverlays } from "@/hooks/use-admin-meta-overlays";
import { summarizeRunResult } from "@/lib/job-run-display";
import type {
  BackfillDisplay,
  MetaSyncAlert,
  MetaSyncAlertTarget,
} from "@/lib/meta-catalog-display";
import {
  backfillDisplay,
  META_SOURCE_LABELS,
  metaSyncAlerts,
  overlayCountsForProvider,
  runningRunId,
} from "@/lib/meta-catalog-display";

/** The tab a funnel stage or an alert opens, with its catalogue pre-filter. */
interface MetaAdminTarget {
  tab?: "catalogue" | "review" | "public";
  triage?: MetaCatalogTriage;
  missing?: boolean;
  awaitingResults?: boolean;
}

/** Every catalogue link must name its source; both sources render at once. */
function catalogueSource(source: MetaSource): MetaSource | undefined {
  return source === "uvsgames" ? undefined : source;
}

interface TriggerEntry {
  trigger: MetaSyncTrigger;
  label: string;
  description: string;
  /** The cron this is the manual form of, when it has one. */
  scheduleKey?: string;
  /**
   * What the button becomes while one of these is running. Absent when the job
   * never reads the cancel flag: the playloltcg recheck runs without a run id,
   * so nothing there could answer a Stop.
   */
  stop?: { job: MetaCancellableJob; label: string; description: string };
  /**
   * A confirmation step, for a trigger that writes rather than reads. The
   * crawls only mirror the source, but a backlog sweep mints live archive
   * events, and nothing takes those back in bulk.
   */
  confirm?: { title: string; body: (pending: number | null) => string; action: string };
}

const AUTO_ACCEPT_DESCRIPTION =
  "Runs the auto-accept rules over every event still awaiting triage. A sync only judges the events it just crawled, so this is how a rule you just turned on reaches the rest.";

const AUTO_ACCEPT_CONFIRM = {
  title: "Auto-accept the whole backlog?",
  body: (pending: number | null) =>
    `The current rules run over ${pending === null ? "every event" : `all ${pending.toLocaleString()} events`} awaiting triage, and every match becomes a live archive event. Dismissed events are left alone, but nothing takes an accept back in bulk.`,
  action: "Run the sweep",
};

const ID_SWEEP_DESCRIPTION =
  "Asks the source about event ids the listing never returns, which is the only way to reach an unlisted or cancelled event. One request per id, so a run takes a bounded slice and the next one carries on.";

const ID_SWEEP_CONFIRM = {
  title: "Sweep event ids?",
  body: () =>
    "The sweep spends one request per id, up to 5,000 in a run, against a source the rest of the pipeline asks a few hundred times a week. Nothing is ever asked about twice, so stopping and continuing later costs nothing.",
  action: "Run the sweep",
};

/** The manual jobs each source offers, in the order they are usually run. */
const TRIGGER_GROUPS: Record<MetaSource, TriggerEntry[]> = {
  uvsgames: [
    {
      trigger: "runSync",
      label: "Sync the catalogue",
      description: "Crawls the last 7 days and everything upcoming.",
      scheduleKey: "meta.uvsgames_sync",
    },
    {
      trigger: "runAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
    {
      trigger: "runRecheck",
      label: "Fetch results",
      description: "Pulls standings and decklists for accepted events that are due.",
      scheduleKey: "meta.uvsgames_recheck",
      stop: {
        job: "recheck",
        label: "Stop fetching results",
        description:
          "A results fetch is running. Stopping keeps every event it already pulled, and the next run picks up the ones still due.",
      },
    },
    {
      trigger: "runIdSweep",
      label: "Sweep event ids",
      description: ID_SWEEP_DESCRIPTION,
      confirm: ID_SWEEP_CONFIRM,
      stop: {
        job: "id_sweep",
        label: "Stop the id sweep",
        description:
          "A sweep is running. Stopping keeps every id it already decided, and the next run carries on with the ones it has not asked about.",
      },
    },
  ],
  playloltcg: [
    {
      trigger: "runPlayloltcgSync",
      label: "Sync the catalogue",
      description: "Crawls the last 7 days and everything upcoming.",
      scheduleKey: "meta.playloltcg_sync",
    },
    {
      trigger: "runPlayloltcgAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
    {
      trigger: "runPlayloltcgRecheck",
      label: "Fetch results",
      description: "Pulls standings and decklists for accepted events that are due.",
      scheduleKey: "meta.playloltcg_recheck",
    },
  ],
  topdeck: [
    {
      trigger: "runTopdeckSync",
      label: "Sync the catalogue",
      description:
        "Reads the last 30 days of each format, with standings and decklists. There is no separate results fetch: one search carries them.",
      scheduleKey: "meta.topdeck_sync",
    },
    {
      trigger: "runTopdeckAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
  ],
};

/**
 * The backfill controls each phase shows, per source. Every source is
 * phase-aware: one "Full backfill" while idle, and "Continue" + "from scratch"
 * once a run stopped partway (the server resumes from the checkpoint either way).
 */
const BACKFILL_TRIGGERS_BY_SOURCE: Record<
  MetaSource,
  Record<"idle" | "resumable", TriggerEntry[]>
> = {
  uvsgames: {
    idle: [
      {
        trigger: "runBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
  playloltcg: {
    idle: [
      {
        trigger: "runPlayloltcgBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runPlayloltcgBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartPlayloltcgBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
  topdeck: {
    idle: [
      {
        trigger: "runTopdeckBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runTopdeckBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartTopdeckBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
};

const JOB_KIND_PREFIX: Record<MetaSource, string> = {
  uvsgames: "meta.uvsgames_",
  playloltcg: "meta.playloltcg_",
  topdeck: "meta.topdeck_",
};

/** The backfill job kind for a source, so the phase reads the right runs. */
const BACKFILL_KIND: Record<MetaSource, string> = {
  uvsgames: "meta.uvsgames_backfill",
  playloltcg: "meta.playloltcg_backfill",
  topdeck: "meta.topdeck_backfill",
};

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

function SyncFunnel({
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

/** The one warehouse fact worth keeping: the mirror exists and is being fed. */
function MirrorLine({ status }: { status: MetaSyncStatus }) {
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

/** A union, not an optional `target`: a forgotten one must fail to compile, not link nowhere. */
type AlertDestination =
  | { kind: "runs"; label: string; status?: JobStatus }
  | { kind: "link"; label: string; target: MetaAdminTarget };

const ALERT_TARGETS: Record<MetaSyncAlertTarget, AlertDestination> = {
  runs: { kind: "runs", label: "Recent runs" },
  "failed-runs": { kind: "runs", label: "The failed runs", status: "failed" },
  "catalogue-accepted": {
    kind: "link",
    label: "Accepted events",
    target: { tab: "catalogue", triage: "accepted" },
  },
  "catalogue-accepted-missing": {
    kind: "link",
    label: "The missing events",
    target: { tab: "catalogue", triage: "accepted", missing: true },
  },
  review: { kind: "link", label: "Review queue", target: { tab: "review" } },
};

function AlertAction({ alert, source }: { alert: MetaSyncAlert; source: MetaSource }) {
  const destination = ALERT_TARGETS[alert.target];
  if (destination.kind === "runs") {
    return (
      <Button
        variant="ghost"
        size="sm"
        render={
          <Link
            to="/admin/job-runs"
            search={{ runPrefix: JOB_KIND_PREFIX[source], runStatus: destination.status }}
          />
        }
      >
        {destination.label}
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      render={
        <Link
          from="/admin/meta"
          to="/admin/meta"
          search={(prev) => ({ ...prev, source: catalogueSource(source), ...destination.target })}
        />
      }
    >
      {destination.label}
    </Button>
  );
}

type SourcedAlert = MetaSyncAlert & { source: MetaSource };

function HealthCard({ alerts }: { alerts: SourcedAlert[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 && (
          <p className="text-muted-foreground">Every source looks healthy.</p>
        )}
        {alerts.map((alert) => (
          <div key={`${alert.source}-${alert.id}`} className="flex items-center gap-2">
            <CircleAlertIcon className="text-destructive size-4 shrink-0" />
            <Badge variant="muted">{META_SOURCE_LABELS[alert.source]}</Badge>
            <span className="flex-1">{alert.message}</span>
            <AlertAction alert={alert} source={alert.source} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TriggerRow({
  entry,
  schedules,
  pending,
  disabled,
  pendingTriage,
  onStart,
}: {
  entry: TriggerEntry;
  schedules: Record<string, boolean>;
  pending: boolean;
  disabled: boolean;
  /** Rows awaiting triage, which is what a confirmed sweep would run over. */
  pendingTriage: number | null;
  onStart: () => void;
}) {
  const scheduled = entry.scheduleKey === undefined || schedules[entry.scheduleKey] === true;
  const confirm = entry.confirm;
  const face = (
    <>
      {pending ? <RefreshCwIcon className="animate-spin" /> : <PlayIcon />}
      {entry.label}
    </>
  );
  return (
    <div className="flex items-start gap-3">
      {confirm === undefined ? (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={onStart}
          className="w-48 shrink-0 justify-start"
        >
          {face}
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger
            disabled={disabled}
            render={<Button variant="outline" className="w-48 shrink-0 justify-start" />}
          >
            {face}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <DialogForm onSubmit={onStart}>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirm.body(pendingTriage)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogPrimitive.Close render={<Button type="submit" />}>
                  {confirm.action}
                </AlertDialogPrimitive.Close>
              </AlertDialogFooter>
            </DialogForm>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <div className="text-muted-foreground">
        {entry.description}
        {!scheduled && (
          <Badge variant="muted" className="ml-2">
            cron disabled
          </Badge>
        )}
      </div>
    </div>
  );
}

function StopRow({
  label,
  description,
  pending,
  onStop,
}: {
  label: string;
  description: string;
  pending: boolean;
  onStop: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={onStop}
        className="w-48 shrink-0 justify-start"
      >
        {pending ? <RefreshCwIcon className="animate-spin" /> : <SquareIcon />}
        {label}
      </Button>
      <div className="text-muted-foreground">{description}</div>
    </div>
  );
}

/** What stopping a running backfill costs, given how far it has read. */
function backfillStopDescription(coveredThrough: string | null): string {
  const covered =
    coveredThrough === null ? "" : `, covered through ${formatDayTime(coveredThrough)}`;
  return `A backfill is running${covered}. Stopping keeps everything read so far, and the next backfill carries on from there.`;
}

function TriggersCard({
  source,
  schedules,
  runs,
  backfill,
  pendingTriage,
}: {
  source: MetaSource;
  schedules: Record<string, boolean>;
  runs: MetaSyncStatus["runs"];
  backfill: BackfillDisplay;
  pendingTriage: number | null;
}) {
  const triggers = TRIGGER_GROUPS[source];
  const run = useRunMetaSync();
  const cancel = useCancelMetaRun(source);
  const [lastOutcome, setLastOutcome] = useState("");

  const pending = run.isPending ? run.variables?.trigger : undefined;
  const stopping = cancel.isPending ? cancel.variables?.job : undefined;

  async function stop(job: MetaCancellableJob, label: string) {
    let result;
    try {
      result = await cancel.mutateAsync({ job });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    setLastOutcome(`${label}: stopping at run ${result.runId}`);
  }

  async function start(trigger: MetaSyncTrigger, label: string) {
    let result;
    try {
      result = await run.mutateAsync({ trigger });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    announceSyncTrigger(label, result);
    setLastOutcome(`${label}: ${result.status.replace("_", " ")}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run a sync now</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Usually the events are crawled automatically on a schedule, but you can run any of the
          jobs manually here.
        </p>
        {triggers.map((entry) => {
          const stoppable =
            entry.stop === undefined
              ? null
              : { ...entry.stop, kind: `meta.${source}_${entry.stop.job}` };
          const running = stoppable === null ? null : runningRunId(runs, stoppable.kind);
          if (stoppable !== null && running !== null) {
            return (
              <StopRow
                key={entry.trigger}
                label={stoppable.label}
                description={stoppable.description}
                pending={stopping === stoppable.job}
                onStop={() => void stop(stoppable.job, entry.label)}
              />
            );
          }
          return (
            <TriggerRow
              key={entry.trigger}
              entry={entry}
              schedules={schedules}
              pending={pending === entry.trigger}
              disabled={run.isPending}
              pendingTriage={pendingTriage}
              onStart={() => void start(entry.trigger, entry.label)}
            />
          );
        })}
        <div className="space-y-3">
          {backfill.phase === "resumable" && (
            <p className="text-muted-foreground text-sm">
              The last backfill {backfill.cancelled ? "was stopped" : "stopped early"} and covered
              events through {formatDayTime(backfill.coveredThrough)}.
            </p>
          )}
          {backfill.phase !== "running" &&
            BACKFILL_TRIGGERS_BY_SOURCE[source][backfill.phase].map((entry) => (
              <TriggerRow
                key={entry.trigger}
                entry={entry}
                schedules={schedules}
                pending={pending === entry.trigger}
                disabled={run.isPending}
                pendingTriage={pendingTriage}
                onStart={() => void start(entry.trigger, entry.label)}
              />
            ))}
          {backfill.phase === "running" && (
            <StopRow
              label="Stop the backfill"
              description={backfillStopDescription(backfill.coveredThrough)}
              pending={stopping === "backfill"}
              onStop={() => void stop("backfill", "Full backfill")}
            />
          )}
        </div>
        {lastOutcome !== "" && <p className="text-muted-foreground">{lastOutcome}</p>}
        <LastRunLine runs={runs} source={source} />
      </CardContent>
    </Card>
  );
}

function LastRunLine({ runs, source }: { runs: MetaSyncStatus["runs"]; source: MetaSource }) {
  const latest = runs[0];
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2">
      {latest === undefined ? (
        <span>No sync has run yet.</span>
      ) : (
        <>
          <span className="font-mono">{latest.kind}</span>
          <JobStatusBadge status={latest.status} />
          <span title={formatDayTime(latest.startedAt)}>
            {formatRelativeTime(latest.startedAt, { seconds: true })}
          </span>
          {latest.errorMessage === null ? (
            <span>{summarizeRunResult(latest.result)}</span>
          ) : (
            <span className="text-destructive">{latest.errorMessage}</span>
          )}
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        render={<Link to="/admin/job-runs" search={{ runPrefix: JOB_KIND_PREFIX[source] }} />}
      >
        All runs
      </Button>
    </div>
  );
}

const ARCHIVE_TRIGGERS: TriggerEntry[] = [
  {
    trigger: "runRetier",
    label: "Reapply tier rules",
    description:
      "Files every event under the current template mappings and moves the ones whose tier changed. Run this after editing tier mappings in Templates & formats.",
  },
  {
    trigger: "runRepromote",
    label: "Re-promote everything",
    description:
      "Rebuilds every archived event from its sources and accepted overlays. The general repair, for a rule the tier pass cannot see. It takes several minutes.",
    confirm: {
      title: "Re-promote the whole archive?",
      body: () =>
        "Every event is rebuilt from its mirrors and its accepted overlays. Nothing a reviewer accepted is lost, but the pass reads and writes the whole archive and takes several minutes.",
      action: "Run the repair",
    },
  },
];

const ARCHIVE_KIND_BY_TRIGGER: Partial<Record<MetaSyncTrigger, string>> = {
  runRetier: "meta.retier",
  runRepromote: "meta.repromote",
};

/** The two passes that re-derive live rows from mirrors already held; neither belongs to a source. */
function ArchiveJobsCard() {
  const { data } = useMetaArchiveJobs();
  const runs = data?.runs ?? [];
  const run = useRunMetaSync();
  const [lastOutcome, setLastOutcome] = useState("");

  const pending = run.isPending ? run.variables?.trigger : undefined;
  const anyRunning = ARCHIVE_TRIGGERS.some(
    (entry) => runningRunId(runs, ARCHIVE_KIND_BY_TRIGGER[entry.trigger] ?? "") !== null,
  );

  async function start(trigger: MetaSyncTrigger, label: string) {
    let result;
    try {
      result = await run.mutateAsync({ trigger });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    announceSyncTrigger(label, result);
    setLastOutcome(`${label}: ${result.status.replace("_", " ")}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reapply the archive&apos;s rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Editing a tier mapping stores it and stops there. These passes are what carry a mapping or
          a rule change onto the live events, and both run in the background.
        </p>
        {ARCHIVE_TRIGGERS.map((entry) => (
          <TriggerRow
            key={entry.trigger}
            entry={entry}
            schedules={{}}
            pending={pending === entry.trigger}
            disabled={run.isPending || anyRunning}
            pendingTriage={null}
            onStart={() => void start(entry.trigger, entry.label)}
          />
        ))}
        {anyRunning && (
          <p className="text-muted-foreground text-sm">
            A pass is running. The buttons come back when it finishes.
          </p>
        )}
        {lastOutcome !== "" && <p className="text-muted-foreground">{lastOutcome}</p>}
        <ArchiveRunLine runs={runs} />
      </CardContent>
    </Card>
  );
}

function ArchiveRunLine({ runs }: { runs: MetaSyncStatus["runs"] }) {
  const latest = runs[0];
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2">
      {latest === undefined ? (
        <span>Neither pass has run yet.</span>
      ) : (
        <>
          <span className="font-mono">{latest.kind}</span>
          <JobStatusBadge status={latest.status} />
          <span title={formatDayTime(latest.startedAt)}>
            {formatRelativeTime(latest.startedAt, { seconds: true })}
          </span>
          {latest.errorMessage === null ? (
            <span>{summarizeRunResult(latest.result)}</span>
          ) : (
            <span className="text-destructive">{latest.errorMessage}</span>
          )}
        </>
      )}
      <Button variant="ghost" size="sm" render={<Link to="/admin/job-runs" search={{}} />}>
        All runs
      </Button>
    </div>
  );
}

/** One source's funnel and manual crawl controls (ADR-014). */
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

/** The Meta Archive's overview (ADR-014): what is wrong, then each source's own stage. */
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
