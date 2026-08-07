import { adminAuditEventsContract } from "@openrift/shared/contracts/admin/audit-events";
import { infiniteQueryOptions, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import type {
  AdminAuditActionsResponse,
  AdminAuditActorsResponse,
  AdminAuditEventsListResponse,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

/** Server-side filters for the audit event list. */
export interface AuditFilters {
  actorUserId?: string;
  action?: string;
  search?: string;
}

const fetchAuditEventsFn = createServerFn({ method: "GET" })
  .validator(
    (input: { cursor?: string; actorUserId?: string; action?: string; search?: string }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<AdminAuditEventsListResponse> =>
      // The contract types payloads as Record<string, unknown>; the response
      // interface narrows them to the serializable AuditPayloadValue shape.
      apiOrpcClient(adminAuditEventsContract, context.cookie).list({
        cursor: data.cursor,
        actorUserId: data.actorUserId || undefined,
        action: data.action || undefined,
        search: data.search || undefined,
      }) as Promise<AdminAuditEventsListResponse>,
  );

const fetchAuditActorsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminAuditActorsResponse> =>
    apiOrpcClient(adminAuditEventsContract, context.cookie).actors(),
  );

const fetchAuditActionsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<AdminAuditActionsResponse> =>
    apiOrpcClient(adminAuditEventsContract, context.cookie).actions(),
  );

/**
 * Infinite-query options for the audit event feed (newest first, keyset
 * cursor). Exported so the route loader can prefetch the first page.
 *
 * @returns Infinite query options keyed by the active filters.
 */
export function auditEventsQueryOptions(filters: AuditFilters = {}) {
  return infiniteQueryOptions({
    queryKey: ["admin", "audit-events", filters] as const,
    queryFn: ({ pageParam }) =>
      fetchAuditEventsFn({
        data: {
          cursor: pageParam || undefined,
          actorUserId: filters.actorUserId,
          action: filters.action,
          search: filters.search,
        },
      }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** @returns The audit event feed for the given filters. */
export function useAuditEvents(filters: AuditFilters) {
  return useInfiniteQuery(auditEventsQueryOptions(filters));
}

/** @returns The distinct actors appearing in the audit log (for the filter dropdown). */
export function useAuditActors() {
  return useQuery({
    queryKey: ["admin", "audit-actors"] as const,
    queryFn: () => fetchAuditActorsFn(),
    staleTime: 5 * 60 * 1000,
  });
}

/** @returns The distinct actions appearing in the audit log (for the filter dropdown). */
export function useAuditActions() {
  return useQuery({
    queryKey: ["admin", "audit-actions"] as const,
    queryFn: () => fetchAuditActionsFn(),
    staleTime: 5 * 60 * 1000,
  });
}
