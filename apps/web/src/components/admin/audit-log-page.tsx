import { formatDayTime } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { LoaderIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { DebouncedSearchInput } from "@/components/admin/debounced-search-input";
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
import { useAuditActions, useAuditActors, useAuditEvents } from "@/hooks/use-admin-audit";
import { formatAuditChanges } from "@/lib/audit-changes";
import type { AdminAuditEventResponse } from "@/lib/server-fns/api-types";
import { cn } from "@/lib/utils";

const ALL_ACTORS = "__all__";
const ALL_ACTIONS = "__all_actions__";

// Values longer than this collapse behind a <details> expander so a pasted
// rules text doesn't blow up the table row.
const LONG_VALUE = 80;

function ChangeValue({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  if (value.length <= LONG_VALUE) {
    return <span className="break-all">{value}</span>;
  }
  return (
    <details className="inline">
      <summary className="text-muted-foreground inline cursor-pointer select-none">
        {value.slice(0, LONG_VALUE)}…
      </summary>
      <span className="break-all">{value}</span>
    </details>
  );
}

function AuditEventRow({ event }: { event: AdminAuditEventResponse }) {
  const changes = formatAuditChanges(event.oldValues, event.newValues);
  return (
    <TableRow>
      <TableCell className="align-top font-mono text-sm whitespace-nowrap" title={event.createdAt}>
        {formatDayTime(event.createdAt)}
      </TableCell>
      <TableCell className="align-top">
        {event.actorName ?? event.actorEmail ?? event.actorUserId}
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="secondary" className="font-mono">
          {event.action}
        </Badge>
      </TableCell>
      <TableCell className="align-top">
        {event.cardSlug ? (
          <Link
            to="/admin/cards/$cardSlug"
            params={{ cardSlug: event.cardSlug }}
            className="hover:underline"
          >
            {event.entityLabel ?? event.cardSlug}
          </Link>
        ) : (
          <span className="text-muted-foreground">
            {event.entityLabel ?? event.entityId ?? "—"}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top">
        {changes.length === 0 ? (
          <span className="text-muted-foreground/60">—</span>
        ) : (
          <ul className="space-y-0.5">
            {changes.map((change) => (
              <li key={change.field} className="text-sm">
                <span className="text-muted-foreground font-mono">{change.field}:</span>{" "}
                {change.from !== null && (
                  <>
                    <ChangeValue value={change.from} />
                    <span className="text-muted-foreground"> &rarr; </span>
                  </>
                )}
                <ChangeValue value={change.to} />
              </li>
            ))}
          </ul>
        )}
      </TableCell>
    </TableRow>
  );
}

export function AuditLogPage() {
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");

  const { data: actorsData } = useAuditActors();
  const { data: actionsData } = useAuditActions();
  const events = useAuditEvents({
    actorUserId: actorUserId || undefined,
    action: action || undefined,
    search: search || undefined,
  });

  const actorOptions = [
    { value: ALL_ACTORS, label: "All actors" },
    ...(actorsData?.actors ?? []).map((actor) => ({
      value: actor.userId,
      label: actor.name ?? actor.email ?? actor.userId,
    })),
  ];

  const actionOptions = [
    { value: ALL_ACTIONS, label: "All actions" },
    ...(actionsData?.actions ?? []).map((value) => ({ value, label: value })),
  ];

  const rows = events.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Audit Log"
        actions={
          <PageTopBarButton onClick={() => void events.refetch()} disabled={events.isFetching}>
            <RefreshCwIcon className={events.isFetching ? "animate-spin" : ""} />
            Refresh
          </PageTopBarButton>
        }
      />
      <PageDescription>
        Catalog changes by admins and card-review helpers. Check/uncheck bookkeeping isn&apos;t
        logged. Times are UTC.
      </PageDescription>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={actorOptions}
          value={actorUserId || ALL_ACTORS}
          onValueChange={(value) => setActorUserId(value && value !== ALL_ACTORS ? value : "")}
        >
          <SelectTrigger aria-label="Filter by actor" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actorOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={actionOptions}
          value={action || ALL_ACTIONS}
          onValueChange={(value) => setAction(value && value !== ALL_ACTIONS ? value : "")}
        >
          <SelectTrigger aria-label="Filter by action" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className={cn(option.value !== ALL_ACTIONS && "font-mono")}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DebouncedSearchInput
          urlValue={search}
          onCommit={setSearch}
          placeholder="Search by card, code, or id…"
          className="w-64"
        />
      </div>

      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">When</TableHead>
            <TableHead className="w-40">Actor</TableHead>
            <TableHead className="w-52">Action</TableHead>
            <TableHead className="w-56">Entity</TableHead>
            <TableHead>Changes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                {events.isPending ? "Loading…" : "No audit events match the filters."}
              </TableCell>
            </TableRow>
          )}
          {rows.map((event) => (
            <AuditEventRow key={event.id} event={event} />
          ))}
        </TableBody>
      </Table>

      {events.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void events.fetchNextPage()}
            disabled={events.isFetchingNextPage}
          >
            {events.isFetchingNextPage && <LoaderIcon className="mr-1 size-4 animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
