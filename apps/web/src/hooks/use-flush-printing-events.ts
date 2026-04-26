import { useMutation, useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

interface WebhookFailure {
  channel: "newPrintings" | "printingChanges";
  status?: number;
  detail: string;
}

interface FlushPrintingEventsResponse {
  sent: number;
  failed: number;
  failures?: WebhookFailure[];
}

const PRINTING_EVENTS_KEY = ["admin", "printing-events"] as const;

const flushPrintingEventsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FlushPrintingEventsResponse> =>
      fetchApiJson<FlushPrintingEventsResponse>({
        errorTitle: "Couldn't flush printing events",
        cookie: context.cookie,
        path: "/api/v1/admin/printing-events/flush",
        method: "POST",
      }),
  );

export function useFlushPrintingEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => flushPrintingEventsFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRINTING_EVENTS_KEY }),
  });
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
  frontImageUrl: string | null;
  changes: { field: string; from: FieldValue; to: FieldValue }[] | null;
  createdAt: string;
}

interface PrintingEventsListResponse {
  events: PrintingEventView[];
}

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
      fetchApiJson<{ retried: number }>({
        errorTitle: "Couldn't retry printing events",
        cookie: context.cookie,
        path: "/api/v1/admin/printing-events/retry",
        method: "POST",
        body: data,
      }),
  );

export function useRetryPrintingEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => retryPrintingEventsFn({ data: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRINTING_EVENTS_KEY }),
  });
}
