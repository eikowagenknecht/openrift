import type { MetaSyncStatus } from "@openrift/shared/contracts/admin/meta-catalog";
import { formatDayTime, formatRelativeTime } from "@openrift/shared/format-date";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JobStatusBadge } from "@/features/admin/components/job-status-badge";
import { announceSyncTrigger } from "@/features/admin/components/meta-catalog-shared";
import { TriggerRow } from "@/features/admin/components/meta-triggers-card";
import { useMetaArchiveJobs, useRunMetaSync } from "@/features/admin/hooks/use-admin-meta-catalog";
import { summarizeRunResult } from "@/features/admin/lib/job-run-display";
import type { MetaSyncTrigger } from "@/features/admin/lib/meta-admin-triggers";
import {
  ARCHIVE_KIND_BY_TRIGGER,
  ARCHIVE_TRIGGERS,
} from "@/features/admin/lib/meta-admin-triggers";
import { runningRunId } from "@/features/meta/lib/meta-catalog-display";

// These re-derive live rows from mirrors already held; neither belongs to a source.
export function ArchiveJobsCard() {
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
