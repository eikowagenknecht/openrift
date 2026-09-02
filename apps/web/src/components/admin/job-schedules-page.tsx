import { formatDayTime, formatRelativeTime } from "@openrift/shared";
import type { JobScheduleView } from "@openrift/shared/contracts/admin/job-schedules";
import { CalendarPlusIcon, LoaderIcon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { JobStatusBadge } from "@/components/admin/job-status-badge";
import { PageDescription, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useDisableJobSchedule,
  useEnableSuggestedJobSchedules,
  useJobSchedules,
  useRunJobNow,
  useSetJobSchedule,
} from "@/hooks/use-job-schedules";
import { formatDuration } from "@/lib/format-duration";

function ScheduleEditor({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: string;
  pending: boolean;
  onSave: (schedule: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Cron expression"
        placeholder="0 3 * * *"
        className="w-52 font-mono"
      />
      <Button onClick={() => onSave(trimmed)} disabled={pending || trimmed === ""}>
        Save
      </Button>
      <Button variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
    </div>
  );
}

function LastRunLine({ lastRun }: { lastRun: NonNullable<JobScheduleView["lastRun"]> }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
        <JobStatusBadge status={lastRun.status} />
        <span>
          Last run {formatRelativeTime(lastRun.startedAt)}
          {lastRun.durationMs !== null && ` · ${formatDuration(lastRun.durationMs)}`}
        </span>
      </div>
      {lastRun.status === "failed" && lastRun.errorMessage !== null && (
        <p className="text-red-600 dark:text-red-400">{lastRun.errorMessage}</p>
      )}
    </div>
  );
}

function JobScheduleCard({ job }: { job: JobScheduleView }) {
  const [editing, setEditing] = useState(false);
  const setSchedule = useSetJobSchedule();
  const disableSchedule = useDisableJobSchedule();
  const runNow = useRunJobNow();

  const isOn = job.schedule !== null;
  const busy = setSchedule.isPending || disableSchedule.isPending || runNow.isPending;

  function handleSave(schedule: string) {
    setSchedule.mutate({ kind: job.kind, schedule }, { onSuccess: () => setEditing(false) });
  }

  function handleEnableSuggested() {
    setSchedule.mutate({ kind: job.kind, schedule: job.suggestedSchedule });
  }

  async function handleRunNow() {
    let started: Awaited<ReturnType<typeof runNow.mutateAsync>>;
    try {
      started = await runNow.mutateAsync({ kind: job.kind });
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
      return;
    }
    if (started.status === "already_running") {
      toast.info("Already running");
    } else {
      toast.success("Started");
    }
  }

  const onActions = (
    <>
      <Button variant="outline" onClick={() => setEditing(true)} disabled={busy}>
        Edit
      </Button>
      <Button
        variant="outline"
        onClick={() => disableSchedule.mutate({ kind: job.kind })}
        disabled={busy}
      >
        Disable
      </Button>
      <Button variant="outline" onClick={() => void handleRunNow()} disabled={busy}>
        {runNow.isPending ? <LoaderIcon className="animate-spin" /> : <PlayIcon />}
        Run now
      </Button>
    </>
  );

  const offActions = (
    <>
      <Button onClick={handleEnableSuggested} disabled={busy || !job.available}>
        {setSchedule.isPending ? <LoaderIcon className="animate-spin" /> : <CalendarPlusIcon />}
        Enable suggested
      </Button>
      <Button variant="ghost" onClick={() => setEditing(true)} disabled={!job.available}>
        Edit
      </Button>
    </>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {job.title}
              {isOn ? (
                <Badge variant="outline" className="font-mono">
                  {job.schedule}
                </Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )}
            </CardTitle>
            <CardDescription>{job.description}</CardDescription>
          </div>
          {!editing && (
            <div className="flex shrink-0 flex-wrap gap-2">{isOn ? onActions : offActions}</div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {!job.available && job.unavailableReason !== null && (
          <p className="text-muted-foreground">{job.unavailableReason}</p>
        )}
        {editing && (
          <ScheduleEditor
            initial={job.schedule ?? job.suggestedSchedule}
            pending={setSchedule.isPending}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
          />
        )}
        {!isOn && !editing && (
          <p className="text-muted-foreground">
            Suggested <span className="font-mono">{job.suggestedSchedule}</span>
          </p>
        )}
        {isOn && job.nextRun !== null && (
          <p className="text-muted-foreground">
            Next run {formatRelativeTime(job.nextRun, { compound: true })} ·{" "}
            <span className="font-mono">{formatDayTime(job.nextRun)}</span> UTC
          </p>
        )}
        {job.lastRun !== null && <LastRunLine lastRun={job.lastRun} />}
      </CardContent>
    </Card>
  );
}

export function JobSchedulesPage() {
  const { data } = useJobSchedules();
  const enableSuggested = useEnableSuggestedJobSchedules();

  const { jobs } = data;
  const allEnabled = jobs.every((job) => !job.available || job.schedule !== null);

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Jobs"
        actions={
          <PageTopBarPrimaryButton
            onClick={() => enableSuggested.mutate()}
            disabled={allEnabled || enableSuggested.isPending}
          >
            {enableSuggested.isPending ? (
              <LoaderIcon className="animate-spin" />
            ) : (
              <CalendarPlusIcon />
            )}
            Enable all suggested
          </PageTopBarPrimaryButton>
        }
      />
      <PageDescription>
        A job runs only while it has a schedule. Expressions are five-field cron, read in UTC.
      </PageDescription>
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobScheduleCard key={job.kind} job={job} />
        ))}
      </div>
    </div>
  );
}
