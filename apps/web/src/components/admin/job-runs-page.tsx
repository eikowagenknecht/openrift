import { formatDayTimeLocal, formatRelativeTime } from "@openrift/shared";
import type { JobRunActivity } from "@openrift/shared/contracts/admin/job-runs";
import {
  JOB_RUN_ACTIVITIES,
  JOB_STATUSES,
  JOB_TRIGGERS,
} from "@openrift/shared/contracts/admin/job-runs";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { JobStatusBadge } from "@/components/admin/job-status-badge";
import { PageDescription, PageTopBarButton } from "@/components/layout/page-top-bar";
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
import { getPageItems } from "@/lib/paginate";
import type { JobRunView } from "@/lib/server-fns/api-types";
import { cn } from "@/lib/utils";

/** Job kinds that expose a cancel endpoint. Only resumable jobs that re-read
 *  `result` between batches can be cancelled mid-run; everything else has no
 *  way to honour a cancel request, so we don't show a button for it. */
const CANCELLABLE_KINDS = new Set<string>(["images.regenerate"]);

const ANY = "__any";

/** Labels for the activity filter, whose values are not display-ready. */
const ACTIVITY_LABELS: Record<JobRunActivity, string> = {
  "did-work": "did work",
  noop: "no-op",
};

const TRIGGER_OPTIONS = [
  { value: ANY, label: "All triggers" },
  ...JOB_TRIGGERS.map((trigger) => ({ value: trigger, label: trigger })),
];

const STATUS_OPTIONS = [
  { value: ANY, label: "All statuses" },
  ...JOB_STATUSES.map((status) => ({ value: status, label: status })),
];

const ACTIVITY_OPTIONS = [
  { value: ANY, label: "All activity" },
  ...JOB_RUN_ACTIVITIES.map((activity) => ({
    value: activity,
    label: ACTIVITY_LABELS[activity],
  })),
];

/**
 * Narrows a filter's raw select value to the contract's union. The {@link ANY}
 * sentinel is absent from every value set, so "no filter" and "not a known
 * value" collapse into the same `undefined` with no cast.
 * @returns The matching union member, or undefined when the filter is off.
 */
function filterValue<T extends string>(values: readonly T[], value: string): T | undefined {
  return values.find((candidate) => candidate === value);
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

function hasResult(result: Record<string, unknown> | null): boolean {
  return result !== null && Object.keys(result).length > 0;
}

export function JobRunsPage() {
  const [page, setPage] = useState(1);
  const [kindFilter, setKindFilter] = useState(ANY);
  const [triggerFilter, setTriggerFilter] = useState(ANY);
  const [statusFilter, setStatusFilter] = useState(ANY);
  const [activityFilter, setActivityFilter] = useState(ANY);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState("");

  const { data, refetch, isFetching, dataUpdatedAt } = useAdminJobRuns({
    page,
    kind: kindFilter === ANY ? undefined : kindFilter,
    trigger: filterValue(JOB_TRIGGERS, triggerFilter),
    status: filterValue(JOB_STATUSES, statusFilter),
    activity: filterValue(JOB_RUN_ACTIVITIES, activityFilter),
  });

  useEffect(() => {
    if (dataUpdatedAt > 0) {
      setLastUpdated(formatDayTimeLocal(new Date(dataUpdatedAt)));
    }
  }, [dataUpdatedAt]);

  // A filter change reframes the whole result set, so jump back to page 1.
  function changeFilter(setFilter: (value: string) => void, value: string) {
    setFilter(value);
    setPage(1);
  }

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

  const topBar = (
    <AdminPageTopBar
      title="Job Runs"
      actions={
        <PageTopBarButton onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "animate-spin" : ""} />
          Refresh
        </PageTopBarButton>
      }
    />
  );

  if (!data) {
    return topBar;
  }

  const { runs, total, limit, kinds } = data;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = (page - 1) * limit + runs.length;

  return (
    <div className="space-y-4">
      {topBar}
      <PageDescription>
        Auto-refreshes every 15 seconds on the first page.
        {lastUpdated && ` Last updated ${lastUpdated}.`}{" "}
        {total === 0
          ? "No runs match the current filters."
          : `Showing ${rangeStart}–${rangeEnd} of ${total} runs.`}
      </PageDescription>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={kindFilter}
          onChange={(value) => changeFilter(setKindFilter, value)}
          width="w-52"
          options={[
            { value: ANY, label: "All kinds" },
            ...kinds.map((kind) => ({ value: kind, label: kind })),
          ]}
        />
        <FilterSelect
          value={triggerFilter}
          onChange={(value) => changeFilter(setTriggerFilter, value)}
          width="w-36"
          options={TRIGGER_OPTIONS}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(value) => changeFilter(setStatusFilter, value)}
          width="w-36"
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          value={activityFilter}
          onChange={(value) => changeFilter(setActivityFilter, value)}
          width="w-36"
          options={ACTIVITY_OPTIONS}
        />
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
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                {total === 0 ? "No job runs yet." : "No runs match the current filters."}
              </TableCell>
            </TableRow>
          )}
          {runs.map((run) => {
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

      <JobRunsPager page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

function JobRunsPager({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }
  const items = getPageItems(page, totalPages);
  return (
    <nav className="flex items-center justify-center gap-1" aria-label="Job run pages">
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="text-muted-foreground px-1.5">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "default" : "outline"}
            size="icon"
            className="size-8 font-mono"
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        <ChevronRightIcon className="size-4" />
      </Button>
    </nav>
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

  // A no-op run succeeded but found nothing to do — dim it so the runs that
  // actually did something stand out at a glance.
  const isNoop = run.noop === true;

  return (
    <>
      <TableRow className={isNoop ? "text-muted-foreground" : undefined}>
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
          <div className="flex items-center gap-1.5">
            <JobStatusBadge status={run.status} />
            {isNoop && (
              <Badge variant="outline" className="text-muted-foreground">
                no-op
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>
          <span className="font-mono" title={formatDayTimeLocal(run.startedAt)}>
            {formatRelativeTime(run.startedAt, { seconds: true })}
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
      <SelectTrigger className={cn("h-8", width)}>
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
