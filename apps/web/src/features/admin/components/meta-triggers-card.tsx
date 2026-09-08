import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type {
  MetaCancellableJob,
  MetaSource,
  MetaSyncStatus,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { formatDayTime, formatRelativeTime } from "@openrift/shared/format-date";
import { Link } from "@tanstack/react-router";
import { PlayIcon, RefreshCwIcon, SquareIcon } from "lucide-react";
import { useState } from "react";

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
import { JobStatusBadge } from "@/features/admin/components/job-status-badge";
import { announceSyncTrigger } from "@/features/admin/components/meta-catalog-shared";
import { useCancelMetaRun, useRunMetaSync } from "@/features/admin/hooks/use-admin-meta-catalog";
import { summarizeRunResult } from "@/features/admin/lib/job-run-display";
import {
  BACKFILL_TRIGGERS_BY_SOURCE,
  JOB_KIND_PREFIX,
  TRIGGER_GROUPS,
} from "@/features/admin/lib/meta-admin-triggers";
import type { MetaSyncTrigger, TriggerEntry } from "@/features/admin/lib/meta-admin-triggers";
import type { BackfillDisplay } from "@/features/meta/lib/meta-catalog-display";
import { runningRunId } from "@/features/meta/lib/meta-catalog-display";

export function TriggerRow({
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

function backfillStopDescription(coveredThrough: string | null): string {
  const covered =
    coveredThrough === null ? "" : `, covered through ${formatDayTime(coveredThrough)}`;
  return `A backfill is running${covered}. Stopping keeps everything read so far, and the next backfill carries on from there.`;
}

export function TriggersCard({
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
