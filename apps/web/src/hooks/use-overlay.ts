import type { OverlayChannelResponse, OverlayPush, OverlaySettings } from "@openrift/shared";
import { overlayContract } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

/**
 * How often the OBS browser source asks for the current card. The response
 * carries `Cache-Control: private, no-cache` and an ETag, so an unchanged
 * second is a 304 with no body — the browser serves the stored copy and this
 * code never sees the difference.
 */
export const OVERLAY_POLL_MS = 1000;

/**
 * One client for the life of the page. The poll fires every second for the
 * length of a stream, and `browserApiOrpcClient` reads `globalThis.location`
 * lazily, so building the link once at module scope is safe and keeps the
 * tick from reconstructing it thousands of times an hour.
 */
const overlayStateClient = browserApiOrpcClient(publicOverlayContract);

// ---------------------------------------------------------------------------
// OBS browser source (token-addressed, no session)
// ---------------------------------------------------------------------------

/**
 * The poll's query options, split out so its timing and resilience settings
 * are testable without rendering the hook.
 *
 * Fetched straight from the browser rather than through a server function: the
 * source runs for the length of a stream, and routing every second through the
 * web server would double the hops and hide the conditional GET that makes the
 * poll nearly free.
 *
 * @returns Query options for the channel's current state.
 */
export function overlayStateQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.overlay.stateByToken(token),
    queryFn: () => overlayStateClient.state({ token }),
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

/**
 * Polls the overlay state for one channel token.
 * @returns The query for the channel's current state.
 */
export function useOverlayState(token: string) {
  return useQuery(overlayStateQueryOptions(token));
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

/**
 * Shared shape of the four dashboard mutations: every one returns the complete
 * updated channel, so the response seeds the channel query directly instead of
 * invalidating it — the dashboard is driven mid-stream, and an invalidate
 * would leave the live preview and the Clear button a full extra round trip
 * behind each action. No `onError` here: declaring one would replace the
 * QueryClient's default, which owns the error toast.
 *
 * @returns The mutation, seeding the channel cache on success.
 */
function useOverlayChannelMutation<TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<OverlayChannelResponse>,
) {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  return useMutation<OverlayChannelResponse, Error, TVariables>({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.overlay.channel(userId), data);
    },
  });
}

/** @returns The mutation that puts a card on stream. */
export function usePushOverlayCard() {
  return useOverlayChannelMutation((input: OverlayPush) => pushOverlayCardFn({ data: input }));
}

const clearOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).clear(),
  );

/** @returns The mutation that takes the current card off stream. */
export function useClearOverlay() {
  return useOverlayChannelMutation(() => clearOverlayFn());
}

const updateOverlaySettingsFn = createServerFn({ method: "POST" })
  .validator((input: OverlaySettings) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).updateSettings(data),
  );

/** @returns The mutation that updates the overlay's corner / scale / plate settings. */
export function useUpdateOverlaySettings() {
  return useOverlayChannelMutation((input: OverlaySettings) =>
    updateOverlaySettingsFn({ data: input }),
  );
}

const rotateOverlayTokenFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).rotateToken(),
  );

/** @returns The mutation that issues a fresh token, blinding old browser sources. */
export function useRotateOverlayToken() {
  return useOverlayChannelMutation(() => rotateOverlayTokenFn());
}
