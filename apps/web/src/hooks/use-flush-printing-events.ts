import type { JobRunStartedResponse } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { getLatestJobRunFn } from "@/components/admin/refresh-actions";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import type {
  JobRunView,
  PrintingEventsListResponse,
  PrintingEventView,
} from "@/lib/server-fns/api-types";
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

// Re-exported for consumers (printing-events-page); the shape is derived from
// the API response in api-types, so it stays aligned with the route schema
// (including the corrected `frontImageId` field).
export type { PrintingEventView };

const fetchPrintingEvents = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<PrintingEventsListResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.admin["printing-events"].$get(),
        "Couldn't load printing events",
      ),
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
