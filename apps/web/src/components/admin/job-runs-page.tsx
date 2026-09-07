import { formatDayTimeLocal, formatRelativeTime } from "@openrift/shared";
import type { JobRunActivity } from "@openrift/shared/contracts/admin/job-runs";
import {
  JOB_RUN_ACTIVITIES,
  JOB_STATUSES,
  JOB_TRIGGERS,
} from "@openrift/shared/contracts/admin/job-runs";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from "lucide-react";
import { useState } from "react";

import { AdminFilterSelect } from "@/components/admin/admin-filters";
import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminPager } from "@/components/admin/admin-pager";
import { JobStatusBadge } from "@/components/admin/job-status-badge";
import { RefreshCountdownButton } from "@/components/admin/refresh-countdown-button";
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
import {
  jobRunsParamsFromSearch,
  jobRunsRefreshIntervalMs,
  useAdminJobRuns,
} from "@/hooks/use-job-runs";
import { useCancelRegenerateImages } from "@/hooks/use-rehost";
import { formatDuration } from "@/lib/format-duration";
import { summarizeRunResult } from "@/lib/job-run-display";
import type { JobRunView } from "@/lib/server-fns/api-types";
import type { JobRunsSearch } from "@/routes/_app/_authenticated/admin/job-runs";
import { Route } from "@/routes/_app/_authenticated/admin/job-runs";

/** Only resumable jobs that re-read `result` between batches can be cancelled mid-run. */
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
 * The {@link ANY} sentinel is absent from every value set, so "no filter" and
 * "not a known value" collapse into the same `undefined` with no cast.
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

function hasResult(result: Record<string, unknown> | null): boolean {
  return result !== null && Object.keys(result).length > 0;
}

const PREFIX_MARK = "prefix:";

function kindOptions(kinds: string[], prefix: string | undefined) {
  const families = new Map<string, number>();
  for (const kind of kinds) {
    const dot = kind.indexOf(".");
    if (dot > 0) {
      const family = kind.slice(0, dot + 1);
      families.set(family, (families.get(family) ?? 0) + 1);
    }
  }
  if (prefix !== undefined && !families.has(prefix)) {
    families.set(prefix, 0);
  }
  return [
    { value: ANY, label: "All kinds" },
    ...[...families]
      .filter(([family, count]) => count > 1 || family === prefix)
      .map(([family]) => ({ value: `${PREFIX_MARK}${family}`, label: `${family}*` })),
    ...kinds.map((kind) => ({ value: kind, label: kind })),
  ];
}

export function JobRunsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const page = search.page ?? 1;
  const { data, refetch, isFetching, dataUpdatedAt } = useAdminJobRuns(
    jobRunsParamsFromSearch(search),
  );

  // A filter change reframes the whole result set, so jump back to page 1.
  function changeFilter(next: Partial<JobRunsSearch>) {
    void navigate({ search: (prev) => ({ ...prev, ...next, page: undefined }), replace: true });
  }

  function changeKind(value: string) {
    changeFilter(
      value.startsWith(PREFIX_MARK)
        ? { runKind: undefined, runPrefix: value.slice(PREFIX_MARK.length) }
        : { runKind: value === ANY ? undefined : value, runPrefix: undefined },
    );
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
        <RefreshCountdownButton
          onRefresh={() => void refetch()}
          isFetching={isFetching}
          dataUpdatedAt={dataUpdatedAt}
          intervalMs={jobRunsRefreshIntervalMs(page)}
        />
      }
    />
  );

  if (!data) {
    return topBar;
  }

  const { runs, total, limit, kinds } = data;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      {topBar}
      <div className="flex flex-wrap items-center gap-2">
        <AdminFilterSelect
          value={
            search.runPrefix === undefined
              ? (search.runKind ?? ANY)
              : `${PREFIX_MARK}${search.runPrefix}`
          }
          onChange={changeKind}
          label="Job kind"
          className="w-52"
          options={kindOptions(kinds, search.runPrefix)}
        />
        <AdminFilterSelect
          value={search.runTrigger ?? ANY}
          onChange={(value) => changeFilter({ runTrigger: filterValue(JOB_TRIGGERS, value) })}
          label="Trigger"
          className="w-36"
          options={TRIGGER_OPTIONS}
        />
        <AdminFilterSelect
          value={search.runStatus ?? ANY}
          onChange={(value) => changeFilter({ runStatus: filterValue(JOB_STATUSES, value) })}
          label="Status"
          className="w-36"
          options={STATUS_OPTIONS}
        />
        <AdminFilterSelect
          value={search.runActivity ?? ANY}
          onChange={(value) =>
            changeFilter({ runActivity: filterValue(JOB_RUN_ACTIVITIES, value) })
          }
          label="Activity"
          className="w-36"
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
            <TableHead>Result</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
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

      <AdminPager
        page={page}
        totalPages={totalPages}
        onPageChange={(next) =>
          void navigate({
            search: (prev) => ({ ...prev, page: next === 1 ? undefined : next }),
            replace: true,
          })
        }
        label="Job run pages"
      />
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

  // A no-op run succeeded but found nothing to do, so it renders dimmed.
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
        <TableCell className="whitespace-normal">
          {run.errorMessage === null ? (
            <span className="text-muted-foreground">{summarizeRunResult(run.result)}</span>
          ) : (
            <span className="text-destructive">{run.errorMessage}</span>
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
          <TableCell colSpan={7} className="whitespace-normal">
            {run.errorMessage !== null && (
              <div className="mb-2">
                <div className="text-muted-foreground uppercase">Error</div>
                <pre className="bg-muted text-destructive overflow-x-auto rounded-md p-2 font-mono">
                  {run.errorMessage}
                </pre>
              </div>
            )}
            {hasResult(run.result) && (
              <div>
                <div className="text-muted-foreground uppercase">Result</div>
                <pre className="bg-muted overflow-x-auto rounded-md p-2 font-mono">
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
