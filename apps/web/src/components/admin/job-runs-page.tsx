import { ChevronDownIcon, ChevronRightIcon, LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminJobRuns } from "@/hooks/use-job-runs";
import { useCancelRegenerateImages } from "@/hooks/use-rehost";
import type { JobRunView } from "@/lib/server-fns/api-types";

/** Job kinds that expose a cancel endpoint. Only resumable jobs that re-read
 *  `result` between batches can be cancelled mid-run; everything else has no
 *  way to honour a cancel request, so we don't show a button for it. */
const CANCELLABLE_KINDS = new Set<string>(["images.regenerate"]);

const ANY = "__any";

function StatusBadge({ status }: { status: JobRunView["status"] }) {
  if (status === "running") {
    return <Badge variant="secondary">running</Badge>;
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-red-600 text-red-600 dark:text-red-400">
        failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-600 text-green-600 dark:text-green-400">
      ok
    </Badge>
  );
}

function TriggerBadge({ trigger }: { trigger: JobRunView["trigger"] }) {
  return (
    <Badge variant="outline" className="font-mono">
      {trigger}
    </Badge>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
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

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString();
}

function hasResult(result: Record<string, unknown> | null): boolean {
  return result !== null && Object.keys(result).length > 0;
}

export function JobRunsPage() {
  const { data, refetch, isFetching, dataUpdatedAt } = useAdminJobRuns();
  const [lastUpdated, setLastUpdated] = useState("");
  const [kindFilter, setKindFilter] = useState(ANY);
  const [triggerFilter, setTriggerFilter] = useState(ANY);
  const [statusFilter, setStatusFilter] = useState(ANY);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(new Date(dataUpdatedAt).toLocaleTimeString());
    }
  }, [dataUpdatedAt]);

  const runs = data?.runs ?? [];

  const kindSet = new Set<string>();
  for (const run of runs) {
    kindSet.add(run.kind);
  }
  const kinds = [...kindSet].toSorted();

  const filtered = runs.filter((run) => {
    if (kindFilter !== ANY && run.kind !== kindFilter) {
      return false;
    }
    if (triggerFilter !== ANY && run.trigger !== triggerFilter) {
      return false;
    }
    if (statusFilter !== ANY && run.status !== statusFilter) {
      return false;
    }
    return true;
  });

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Auto-refreshes every 15 seconds.{lastUpdated && ` Last updated ${lastUpdated}.`} Showing
          the {runs.length} most recent runs.
        </p>
        <div className="flex items-center gap-2">
          <FilterSelect
            value={kindFilter}
            onChange={setKindFilter}
            width="w-52"
            options={[
              { value: ANY, label: "All kinds" },
              ...kinds.map((kind) => ({ value: kind, label: kind })),
            ]}
          />
          <FilterSelect
            value={triggerFilter}
            onChange={setTriggerFilter}
            width="w-36"
            options={[
              { value: ANY, label: "All triggers" },
              { value: "cron", label: "cron" },
              { value: "admin", label: "admin" },
              { value: "api", label: "api" },
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            width="w-36"
            options={[
              { value: ANY, label: "All statuses" },
              { value: "running", label: "running" },
              { value: "succeeded", label: "succeeded" },
              { value: "failed", label: "failed" },
            ]}
          />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Kind</TableHead>
            <TableHead className="w-28">Trigger</TableHead>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-44">Started</TableHead>
            <TableHead className="w-32">Duration</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                {runs.length === 0 ? "No job runs yet." : "No runs match the current filters."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((run) => {
            const showDetails = run.errorMessage !== null || hasResult(run.result);
            const isOpen = expanded.has(run.id);
            return (
              <JobRunRow
                key={run.id}
                run={run}
                showDetails={showDetails}
                isOpen={isOpen}
                onToggle={() => toggleExpanded(run.id)}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function JobRunRow({
  run,
  showDetails,
  isOpen,
  onToggle,
}: {
  run: JobRunView;
  showDetails: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const cancelRegen = useCancelRegenerateImages();
  const canCancel = run.status === "running" && CANCELLABLE_KINDS.has(run.kind);

  return (
    <>
      <TableRow>
        <TableCell className="p-0 pl-2">
          {showDetails ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={onToggle}
              aria-expanded={isOpen}
              aria-label={isOpen ? "Hide details" : "Show details"}
            >
              {isOpen ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </Button>
          ) : null}
        </TableCell>
        <TableCell className="font-mono">{run.kind}</TableCell>
        <TableCell>
          <TriggerBadge trigger={run.trigger} />
        </TableCell>
        <TableCell>
          <StatusBadge status={run.status} />
        </TableCell>
        <TableCell>
          <span className="font-mono" title={formatAbsolute(run.startedAt)}>
            {formatTimeAgo(run.startedAt)}
          </span>
        </TableCell>
        <TableCell className="font-mono">
          {run.durationMs === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatDuration(run.durationMs)
          )}
        </TableCell>
        <TableCell className="p-1">
          {canCancel && (
            <Button
              variant="outline"
              size="sm"
              disabled={cancelRegen.isPending}
              onClick={() => cancelRegen.mutate()}
            >
              {cancelRegen.isPending ? <LoaderIcon className="size-3.5 animate-spin" /> : "Cancel"}
            </Button>
          )}
        </TableCell>
      </TableRow>
      {isOpen && showDetails && (
        <TableRow>
          <TableCell />
          <TableCell colSpan={6} className="whitespace-normal">
            {run.errorMessage !== null && (
              <div className="mb-2">
                <div className="text-muted-foreground uppercase">Error</div>
                <pre className="bg-muted text-destructive overflow-x-auto rounded p-2 font-mono">
                  {run.errorMessage}
                </pre>
              </div>
            )}
            {hasResult(run.result) && (
              <div>
                <div className="text-muted-foreground uppercase">Result</div>
                <pre className="bg-muted overflow-x-auto rounded p-2 font-mono">
                  {JSON.stringify(run.result, null, 2)}
                </pre>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  width,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  width: string;
}) {
  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next ?? ANY)}>
      <SelectTrigger className={`h-8 ${width}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
