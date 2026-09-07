import { formatDayTimeLocal, formatRelativeTime } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, RotateCcwIcon, SendIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { RefreshCountdownButton } from "@/components/admin/refresh-countdown-button";
import {
  PageDescription,
  PageTopBarButton,
  PageTopBarPrimaryButton,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PrintingEventView } from "@/hooks/use-flush-printing-events";
import {
  isFlushPrintingEventsResult,
  PRINTING_EVENTS_REFRESH_INTERVAL_MS,
  useAdminPrintingEvents,
  useFlushPrintingEvents,
  useLatestFlushRun,
  useRetryPrintingEvents,
} from "@/hooks/use-flush-printing-events";
import type { JobRunView } from "@/lib/server-fns/api-types";

function StatusBadge({ status }: { status: PrintingEventView["status"] }) {
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-destructive text-destructive">
        failed
      </Badge>
    );
  }
  return <Badge variant="secondary">pending</Badge>;
}

export function PrintingEventsPage() {
  const { data, refetch, isFetching, dataUpdatedAt } = useAdminPrintingEvents();
  const flush = useFlushPrintingEvents();
  const latestRun = useLatestFlushRun();
  const retry = useRetryPrintingEvents();
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const events = data?.events ?? [];
  const pending = events.filter((e) => e.status === "pending");
  const failed = events.filter((e) => e.status === "failed");
  const isFlushRunning = flush.isPending || latestRun.data?.status === "running";

  async function handleFlush() {
    let started: Awaited<ReturnType<typeof flush.mutateAsync>>;
    try {
      started = await flush.mutateAsync();
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    if (started.status === "already_running") {
      toast.info("A flush is already running");
    } else {
      toast.success("Flush started");
    }
  }

  async function handleRetry(ids: string[]) {
    setRetryingIds(new Set(ids));
    const suffix = ids.length === 1 ? "" : "s";
    try {
      await retry.mutateAsync(ids);
      toast.success(`Reset ${ids.length} event${suffix} to pending`);
    } catch {
      // Reported by the global mutation error toast.
    }
    setRetryingIds(new Set());
  }

  const topBar = (
    <AdminPageTopBar
      title="Printing Events"
      actions={
        <>
          {failed.length > 0 && (
            <PageTopBarButton
              onClick={() => void handleRetry(failed.map((e) => e.id))}
              disabled={retry.isPending}
            >
              {retry.isPending ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />}
              Retry all failed
            </PageTopBarButton>
          )}
          <RefreshCountdownButton
            onRefresh={() => void refetch()}
            isFetching={isFetching}
            dataUpdatedAt={dataUpdatedAt}
            intervalMs={PRINTING_EVENTS_REFRESH_INTERVAL_MS}
          />
          <PageTopBarPrimaryButton onClick={() => void handleFlush()} disabled={isFlushRunning}>
            {isFlushRunning ? <LoaderIcon className="animate-spin" /> : <SendIcon />}
            Flush now
          </PageTopBarPrimaryButton>
        </>
      }
    />
  );

  if (!data) {
    return topBar;
  }

  return (
    <div className="space-y-4">
      {topBar}
      <PageDescription>
        Pending events flush every 15 minutes. After 5 failed retries an event stops being retried.
      </PageDescription>

      <div className="text-muted-foreground flex gap-4 text-sm">
        <span>
          <strong className="text-foreground">{pending.length}</strong> pending
        </span>
        <span>
          <strong className="text-foreground">{failed.length}</strong> failed
        </span>
      </div>

      {latestRun.data && <FlushRunStatus run={latestRun.data} />}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Status</TableHead>
            <TableHead>Card</TableHead>
            <TableHead className="w-28">Set</TableHead>
            <TableHead className="w-20 text-right">Retries</TableHead>
            <TableHead className="w-32">Created</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                No queued events. The webhook is caught up.
              </TableCell>
            </TableRow>
          )}
          {events.map((event) => (
            <PrintingEventRow
              key={event.id}
              event={event}
              isRetrying={retryingIds.has(event.id)}
              onRetry={() => void handleRetry([event.id])}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PrintingEventRow({
  event,
  isRetrying,
  onRetry,
}: {
  event: PrintingEventView;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <StatusBadge status={event.status} />
      </TableCell>
      <TableCell>
        {event.cardSlug ? (
          <Link
            to="/cards/$cardSlug"
            params={{ cardSlug: event.cardSlug }}
            className="hover:underline"
          >
            {event.cardName ?? event.cardSlug}
          </Link>
        ) : (
          <span className="text-muted-foreground">{event.cardName ?? "—"}</span>
        )}
        {event.shortCode !== null && (
          <span className="text-muted-foreground ml-2 font-mono">{event.shortCode}</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{event.setName ?? "—"}</TableCell>
      <TableCell className="text-right font-mono">{event.retryCount}</TableCell>
      <TableCell className="font-mono text-sm" title={formatDayTimeLocal(event.createdAt)}>
        {formatRelativeTime(event.createdAt, { seconds: true })}
      </TableCell>
      <TableCell>
        {event.status === "failed" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRetry}
            disabled={isRetrying}
            title="Reset to pending"
          >
            {isRetrying ? (
              <LoaderIcon className="size-3.5 animate-spin" />
            ) : (
              <RotateCcwIcon className="size-3.5" />
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function FlushRunStatus({ run }: { run: JobRunView }) {
  if (run.status === "running") {
    return (
      <p className="text-muted-foreground flex items-center gap-1 text-sm">
        <LoaderIcon className="size-4 animate-spin" />
        Flush started {formatRelativeTime(run.startedAt, { seconds: true })}
      </p>
    );
  }
  if (run.status === "failed") {
    return (
      <p className="text-destructive flex items-center gap-1 text-sm">
        <XIcon className="size-4" />
        {run.errorMessage ?? "Flush failed"}
      </p>
    );
  }
  if (isFlushPrintingEventsResult(run.result)) {
    const { sent, failed: failedCount } = run.result;
    if (sent === 0 && failedCount === 0) {
      return (
        <p className="text-muted-foreground flex items-center gap-1 text-sm">
          <CheckIcon className="size-4" />
          No pending events on last flush
        </p>
      );
    }
    return (
      <p
        className={
          failedCount === 0
            ? "text-success flex items-center gap-1 text-sm"
            : "text-warning flex items-center gap-1 text-sm"
        }
      >
        <CheckIcon className="size-4" />
        Last flush sent {sent}, failed {failedCount}
      </p>
    );
  }
  return (
    <p className="text-success flex items-center gap-1 text-sm">
      <CheckIcon className="size-4" />
      Last flush completed
    </p>
  );
}
