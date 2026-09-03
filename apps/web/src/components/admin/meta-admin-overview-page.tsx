import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { formatDayTime, formatRelativeTime } from "@openrift/shared";
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
import { ExpandToggle } from "@/components/ui/expand-toggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MetaSyncTrigger } from "@/hooks/use-admin-meta-catalog";
import {
  SYNC_STATUS_POLL_MS,
  useCancelMetaRun,
  useMetaSyncStatus,
  useRunMetaSync,
} from "@/hooks/use-admin-meta-catalog";
import { useAdminMetaOverlays } from "@/hooks/use-admin-meta-overlays";
import type {
  BackfillDisplay,
  MetaSyncAlert,
  MetaSyncAlertTarget,
} from "@/lib/meta-catalog-display";
import {
  backfillDisplay,
  formatRunDuration,
  META_SOURCE_LABELS,
  metaSyncAlerts,
  overlayCountsForProvider,
  runningRunId,
  summarizeRunResult,
} from "@/lib/meta-catalog-display";

/** The tab a funnel stage or an alert opens, with its catalogue pre-filter. */
interface MetaAdminTarget {
  tab?: "catalogue" | "review" | "public";
  triage?: MetaCatalogTriage;
  missing?: boolean;
  awaitingResults?: boolean;
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
};

/**
 * The backfill controls each phase shows, per source. Both sources are
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
};

/** The backfill job kind for a source, so the phase reads the right runs. */
const BACKFILL_KIND: Record<MetaSource, string> = {
  uvsgames: "meta.uvsgames_backfill",
  playloltcg: "meta.playloltcg_backfill",
};

function FunnelStage({
  label,
  value,
  detail,
  target,
}: {
  label: string;
  value: number;
  detail: string;
  target: MetaAdminTarget;
}) {
  return (
    <Link
      from="/admin/meta"
      to="/admin/meta"
      search={(prev) => ({ ...prev, ...target })}
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
        label="Untriaged"
        value={counts.new}
        detail={`of ${catalog.total.toLocaleString()} catalogued`}
        target={{ tab: "catalogue" }}
      />
      <FunnelArrow />
      <FunnelStage
        label="Awaiting results"
        value={catalog.acceptedAwaitingResults}
        detail={`${catalog.dueRecheck.toLocaleString()} rechecks due`}
        target={{ tab: "catalogue", triage: "accepted", awaitingResults: true }}
      />
      <FunnelArrow />
      {/* The queue itself is cross-source, so the stage names the source its
          count is scoped to; the Review tab's own badge counts every source. */}
      <FunnelStage
        label={`Needs review from ${META_SOURCE_LABELS[source]}`}
        value={pendingReview}
        detail={`${unresolvedCards.toLocaleString()} unmatched card names`}
        target={{ tab: "review" }}
      />
      <FunnelArrow />
      <FunnelStage
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

/**
 * Where an alert's action goes. The runs panel is not a search param, so it is
 * its own variant rather than a missing `target`: a link entry that forgot one
 * would otherwise compile into a link that goes nowhere.
 */
type AlertDestination =
  | { kind: "runs"; label: string }
  | { kind: "link"; label: string; target: MetaAdminTarget };

const ALERT_TARGETS: Record<MetaSyncAlertTarget, AlertDestination> = {
  runs: { kind: "runs", label: "Recent runs" },
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

function AlertAction({ alert, onShowRuns }: { alert: MetaSyncAlert; onShowRuns: () => void }) {
  const destination = ALERT_TARGETS[alert.target];
  if (destination.kind === "runs") {
    return (
      <Button variant="ghost" size="sm" onClick={onShowRuns}>
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
          search={(prev) => ({ ...prev, ...destination.target })}
        />
      }
    >
      {destination.label}
    </Button>
  );
}

function HealthCard({ alerts, onShowRuns }: { alerts: MetaSyncAlert[]; onShowRuns: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.length === 0 && <p className="text-muted-foreground">Sync looks healthy.</p>}
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-center gap-2">
            <CircleAlertIcon className="text-destructive size-4 shrink-0" />
            <span className="flex-1">{alert.message}</span>
            <AlertAction alert={alert} onShowRuns={onShowRuns} />
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
      </CardContent>
    </Card>
  );
}

function RunSummaryLine({ runs }: { runs: MetaSyncStatus["runs"] }) {
  const latest = runs[0];
  if (latest === undefined) {
    return <span className="text-muted-foreground">No sync has run yet.</span>;
  }
  return (
    <span className="text-muted-foreground flex items-center gap-2">
      <span className="font-mono">{latest.kind}</span>
      <JobStatusBadge status={latest.status} />
      {formatRelativeTime(latest.startedAt)}
    </span>
  );
}

function RunsCard({
  runs,
  open,
  onToggle,
}: {
  runs: MetaSyncStatus["runs"];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <ExpandToggle expanded={open} onClick={onToggle} className="w-full">
          <CardTitle>Recent runs</CardTitle>
          {!open && <RunSummaryLine runs={runs} />}
        </ExpandToggle>
      </CardHeader>
      {open && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead className="w-28">Trigger</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-36">Started</TableHead>
                <TableHead className="w-28">Duration</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                    No sync has run yet.
                  </TableCell>
                </TableRow>
              )}
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-mono">{run.kind}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {run.trigger}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono" title={formatDayTime(run.startedAt)}>
                      {formatRelativeTime(run.startedAt, { seconds: true })}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{formatRunDuration(run.durationMs)}</TableCell>
                  <TableCell className="whitespace-normal">
                    {run.errorMessage === null ? (
                      <span className="text-muted-foreground">
                        {summarizeRunResult(run.result)}
                      </span>
                    ) : (
                      <span className="text-destructive">{run.errorMessage}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

/**
 * The Meta Archive's overview (ADR-014): the pipeline an event walks from the
 * uvsgames listing to the public /meta pages, what is currently wrong with it,
 * and the manual form of every crawl the crons own.
 *
 * @returns The overview tab.
 */
export function MetaAdminOverviewPage({ source }: { source: MetaSource }) {
  const { data, refetch, isFetching, dataUpdatedAt } = useMetaSyncStatus(source);
  const overlays = useAdminMetaOverlays();
  const [runsOpen, setRunsOpen] = useState(false);

  const { pendingReview, unresolvedCards } = overlayCountsForProvider(
    overlays.data.overlays,
    source,
  );
  const alerts = data === undefined ? [] : metaSyncAlerts(data, unresolvedCards, new Date());

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Meta Archive"
        actions={
          <RefreshCountdownButton
            onRefresh={() => void refetch()}
            isFetching={isFetching}
            dataUpdatedAt={dataUpdatedAt}
            intervalMs={SYNC_STATUS_POLL_MS}
          />
        }
      />
      <PageDescription>
        Event data is read from each source&apos;s public API. The crawl reads only the event
        overview; standings and decklists are fetched separately, and only for accepted events.
      </PageDescription>

      {data === undefined ? (
        <p className="text-muted-foreground">Loading the sync status…</p>
      ) : (
        <>
          <HealthCard alerts={alerts} onShowRuns={() => setRunsOpen(true)} />
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
      {data !== undefined && (
        <RunsCard runs={data.runs} open={runsOpen} onToggle={() => setRunsOpen(!runsOpen)} />
      )}
    </div>
  );
}
