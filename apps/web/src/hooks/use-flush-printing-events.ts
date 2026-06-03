import type { JobRunStartedResponse } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getLatestJobRunFn } from "@/components/admin/refresh-actions";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type { JobRunView } from "@/lib/server-fns/api-types";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

interface WebhookFailure {
  channel: "newPrintings" | "printingChanges";
  status?: number;
  detail: string;
}

export interface FlushPrintingEventsResult {
  sent: number;
  failed: number;
  failures?: WebhookFailure[];
}

const FLUSH_PRINTING_EVENTS_KIND = "discord.flush_printing_events";

const PRINTING_EVENTS_KEY = ["admin", "printing-events"] as const;
const FLUSH_RUN_KEY = ["admin", "job-runs", FLUSH_PRINTING_EVENTS_KIND] as const;

const flushPrintingEventsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<JobRunStartedResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["printing-events"].flush.$post(),
        "Couldn't start flush",
      ),
  );

export function useFlushPrintingEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => flushPrintingEventsFn(),
    onSuccess: () => {
      // Surface the new running row immediately and refresh the queue list
      // once the flush completes; the run-poll hook drives intermediate state.
      queryClient.invalidateQueries({ queryKey: FLUSH_RUN_KEY });
      queryClient.invalidateQueries({ queryKey: PRINTING_EVENTS_KEY });
    },
  });
}

/**
 * Poll the latest job_runs row for the discord flush. Refetches every 2s
 * while running so the UI flips to the result toast quickly, every 60s
 * otherwise.
 *
 * @returns A react-query `UseQueryResult<JobRunView | null>`.
 */
export function useLatestFlushRun() {
  return useQuery({
    queryKey: FLUSH_RUN_KEY,
    queryFn: async (): Promise<JobRunView | null> => {
      const response = await getLatestJobRunFn({ data: { kind: FLUSH_PRINTING_EVENTS_KIND } });
      return response.runs[0] ?? null;
    },
    refetchInterval: (query) => (query.state.data?.status === "running" ? 2000 : 60_000),
  });
}

export function isFlushPrintingEventsResult(value: unknown): value is FlushPrintingEventsResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { sent?: unknown; failed?: unknown };
  return typeof candidate.sent === "number" && typeof candidate.failed === "number";
}

type FieldValue = string | number | boolean | null;

export interface PrintingEventView {
  id: string;
  eventType: "new" | "changed";
  status: "pending" | "sent" | "failed";
  retryCount: number;
  printingId: string;
  cardName: string | null;
  cardSlug: string | null;
  setName: string | null;
  shortCode: string | null;
  rarity: string | null;
  finish: string | null;
  finishLabel: string | null;
  artist: string | null;
  language: string | null;
  languageName: string | null;
  // The API returns the image ID (the route field is frontImageId); the old
  // `frontImageUrl` name was wrong (undefined at runtime) and unused.
  frontImageId: string | null;
  changes: { field: string; from: FieldValue; to: FieldValue }[] | null;
  createdAt: string;
}

interface PrintingEventsListResponse {
  events: PrintingEventView[];
}

// TODO(sweep): kept on fetchApiJson. The route types changes[].from/to as
// z.unknown() (the DB FieldChange.from/to are unknown), but a createServerFn
// return type can't carry `unknown` (not serializable per TanStack Start). To
// migrate, give the route a serializable JSON-value schema for from/to and use
// that type here. The frontImageId field name above is already corrected.
const fetchPrintingEvents = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PrintingEventsListResponse> =>
      fetchApiJson<PrintingEventsListResponse>({
        errorTitle: "Couldn't load printing events",
        cookie: context.cookie,
        path: "/api/v1/admin/printing-events",
      }),
  );

export const adminPrintingEventsQueryOptions = queryOptions({
  queryKey: PRINTING_EVENTS_KEY,
  queryFn: () => fetchPrintingEvents(),
  refetchInterval: 30_000,
});

export function useAdminPrintingEvents() {
  return useQuery(adminPrintingEventsQueryOptions);
}

const retryPrintingEventsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { ids: string[] }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<{ retried: number }> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["printing-events"].retry.$post({
          json: data,
        }),
        "Couldn't retry printing events",
      ),
  );

export function useRetryPrintingEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => retryPrintingEventsFn({ data: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRINTING_EVENTS_KEY }),
  });
}
