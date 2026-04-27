import { humanizePrintingField } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { LoaderIcon, RefreshCwIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  useAdminPrintingEvents,
  useFlushPrintingEvents,
  useRetryPrintingEvents,
} from "@/hooks/use-flush-printing-events";

function StatusBadge({ status }: { status: PrintingEventView["status"] }) {
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-red-600 text-red-600 dark:text-red-400">
        failed
      </Badge>
    );
  }
  return <Badge variant="secondary">pending</Badge>;
}

function EventTypeBadge({ eventType }: { eventType: PrintingEventView["eventType"] }) {
  if (eventType === "new") {
    return (
      <Badge variant="outline" className="border-green-600 text-green-600 dark:text-green-400">
        new
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-yellow-600 text-yellow-700 dark:text-yellow-400">
      changed
    </Badge>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.round(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map(String).join(", ");
  }
  return String(value);
}

export function PrintingEventsPage() {
  const { data, refetch, isFetching } = useAdminPrintingEvents();
  const flush = useFlushPrintingEvents();
  const retry = useRetryPrintingEvents();
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const events = data?.events ?? [];
  const pending = events.filter((e) => e.status === "pending");
  const failed = events.filter((e) => e.status === "failed");

  async function handleFlush() {
    let result: Awaited<ReturnType<typeof flush.mutateAsync>>;
    try {
      result = await flush.mutateAsync();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Flush failed");
      return;
    }
    if (result.sent === 0 && result.failed === 0) {
      toast.success("No pending printing events");
    } else if (result.failed === 0) {
      toast.success(`Sent ${result.sent} events`);
    } else {
      toast.warning(`Sent ${result.sent}, failed ${result.failed} (will retry)`);
    }
  }

  async function handleRetry(ids: string[]) {
    setRetryingIds(new Set(ids));
    try {
      await retry.mutateAsync(ids);
      toast.success(`Reset ${ids.length} event${ids.length === 1 ? "" : "s"} to pending`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setRetryingIds(new Set());
    }
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          The Discord webhook queue. Pending events are flushed every 15 minutes; events that fail 5
          retries are marked failed and stop being retried automatically. Auto-refreshes every 30
          seconds.
        </p>
        <div className="flex items-center gap-2">
          {failed.length > 0 && (
            <Button
              variant="outline"
              onClick={() => handleRetry(failed.map((e) => e.id))}
              disabled={retry.isPending}
            >
              {retry.isPending ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />}
              Retry all failed
            </Button>
          )}
          <Button onClick={handleFlush} disabled={flush.isPending}>
            {flush.isPending ? <LoaderIcon className="animate-spin" /> : <SendIcon />}
            Flush now
          </Button>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="text-muted-foreground flex gap-4 text-sm">
        <span>
          <strong className="text-foreground">{pending.length}</strong> pending
        </span>
        <span>
          <strong className="text-foreground">{failed.length}</strong> failed
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-24">Type</TableHead>
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
              <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                No queued events. The webhook is caught up.
              </TableCell>
            </TableRow>
          )}
          {events.map((event) => (
            <PrintingEventRow
              key={event.id}
              event={event}
              isRetrying={retryingIds.has(event.id)}
              onRetry={() => handleRetry([event.id])}
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
    <>
      <TableRow>
        <TableCell>
          <StatusBadge status={event.status} />
        </TableCell>
        <TableCell>
          <EventTypeBadge eventType={event.eventType} />
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
        <TableCell className="font-mono text-sm" title={new Date(event.createdAt).toLocaleString()}>
          {formatTimeAgo(event.createdAt)}
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
      {event.changes !== null && event.changes.length > 0 && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={6} className="pb-4 whitespace-normal">
            <div className="space-y-2">
              {event.changes.map((change, idx) => (
                <FieldChangeRow
                  key={`${event.id}-${idx}`}
                  field={change.field}
                  from={change.from}
                  to={change.to}
                />
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

const MULTILINE_THRESHOLD = 80;

function FieldChangeRow({ field, from, to }: { field: string; from: unknown; to: unknown }) {
  const fromStr = formatValue(from);
  const toStr = formatValue(to);
  const isLong = fromStr.length > MULTILINE_THRESHOLD || toStr.length > MULTILINE_THRESHOLD;

  if (isLong) {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium">{humanizePrintingField(field)}</div>
        <div className="text-muted-foreground grid grid-cols-[5rem_1fr] gap-x-2 font-mono break-words">
          <span>Before</span>
          <span className="text-foreground">{fromStr}</span>
          <span>After</span>
          <span className="text-foreground">{toStr}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm break-words">
      <span className="font-medium">{humanizePrintingField(field)}:</span>{" "}
      <span className="font-mono">{fromStr}</span>
      <span className="text-muted-foreground"> → </span>
      <span className="font-mono">{toStr}</span>
    </div>
  );
}
