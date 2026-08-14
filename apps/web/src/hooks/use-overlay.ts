import type { OverlayChannelResponse, OverlayPush, OverlaySettings } from "@openrift/shared";
import { overlayContract } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/**
 * How often the OBS browser source asks for the current card. The response
 * carries `Cache-Control: private, no-cache` and an ETag, so an unchanged
 * second is a 304 with no body — the browser serves the stored copy and this
 * code never sees the difference.
 */
const OVERLAY_POLL_MS = 1000;

// ---------------------------------------------------------------------------
// OBS browser source (token-addressed, no session)
// ---------------------------------------------------------------------------

/**
 * Polls the overlay state for one channel token.
 *
 * Fetched straight from the browser rather than through a server function: the
 * source runs for the length of a stream, and routing every second through the
 * web server would double the hops and hide the conditional GET that makes the
 * poll nearly free.
 *
 * @returns The query for the channel's current state.
 */
export function useOverlayState(token: string) {
  return useQuery({
    queryKey: queryKeys.overlay.stateByToken(token),
    queryFn: () => browserApiOrpcClient(publicOverlayContract).state({ token }),
    refetchInterval: OVERLAY_POLL_MS,
    // OBS keeps the page in a background-ish state; without this the poll
    // stops the moment the streamer clicks away and the card never updates.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    // A dropped API deploy or a blip must not blank someone's stream: keep
    // showing the last good state rather than falling back to undefined.
    retry: true,
    staleTime: 0,
  });
}

// ---------------------------------------------------------------------------
// Control dashboard (session-gated)
// ---------------------------------------------------------------------------

const fetchOverlayChannelFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).get(),
  );

/**
 * The signed-in creator's channel. The API creates it on first read, so this
 * never has an "no overlay yet" state to handle.
 * @returns Query options for the user's overlay channel.
 */
export function overlayChannelQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.overlay.channel(userId),
    queryFn: () => fetchOverlayChannelFn(),
  });
}

export function useOverlayChannel() {
  const userId = useRequiredUserId();
  return useQuery(overlayChannelQueryOptions(userId));
}

const pushOverlayCardFn = createServerFn({ method: "POST" })
  .validator((input: OverlayPush) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).push(data),
  );

export function usePushOverlayCard() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (input: OverlayPush) => pushOverlayCardFn({ data: input }),
    invalidates: [queryKeys.overlay.channel(userId)],
  });
}

const clearOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).clear(),
  );

export function useClearOverlay() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: () => clearOverlayFn(),
    invalidates: [queryKeys.overlay.channel(userId)],
  });
}

const updateOverlaySettingsFn = createServerFn({ method: "POST" })
  .validator((input: OverlaySettings) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).updateSettings(data),
  );

export function useUpdateOverlaySettings() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (input: OverlaySettings) => updateOverlaySettingsFn({ data: input }),
    invalidates: [queryKeys.overlay.channel(userId)],
  });
}

const rotateOverlayTokenFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).rotateToken(),
  );

export function useRotateOverlayToken() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: () => rotateOverlayTokenFn(),
    invalidates: [queryKeys.overlay.channel(userId)],
  });
}
