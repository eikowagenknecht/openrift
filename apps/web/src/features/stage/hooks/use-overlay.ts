import type {
  OverlayChannelResponse,
  OverlayPush,
  OverlayPushBoard,
  OverlaySetBoardReveal,
  OverlaySetHidden,
  OverlaySettings,
} from "@openrift/shared/contracts/overlay";
import { overlayContract } from "@openrift/shared/contracts/overlay";
import { publicOverlayContract } from "@openrift/shared/contracts/public-overlay";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient, browserApiOrpcClient } from "@/lib/server-fns/orpc-client";

export const OVERLAY_POLL_MS = 1000;

/** `browserApiOrpcClient` reads `globalThis.location` lazily; safe to build once at module scope. */
const overlayStateClient = browserApiOrpcClient(publicOverlayContract);

/** Must fetch directly from the browser: routing through the web server doubles the hops and hides the conditional GET. */
export function overlayStateQueryOptions(token: string, presetId?: string) {
  return queryOptions({
    queryKey: queryKeys.overlay.stateByToken(token, presetId),
    queryFn: () => overlayStateClient.state({ token, presetId }),
    refetchInterval: OVERLAY_POLL_MS,
    // OBS keeps the page in a background-ish state; without this the poll
    // stops the moment the streamer clicks away and the card never updates.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    // A dropped API deploy or blip must not blank the stream: keep the last good state.
    retry: true,
    staleTime: 0,
  });
}

/** An unknown `presetId` is ignored server-side, not treated as an error, so a deleted preset keeps painting. */
export function useOverlayState(token: string, presetId?: string) {
  return useQuery(overlayStateQueryOptions(token, presetId));
}

const fetchOverlayChannelFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).get(),
  );

/** The API creates the channel on first read, so there is no "no overlay yet" state. */
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
 * No `onError` here: declaring one would replace the QueryClient's default,
 * which owns the error toast.
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

export function usePushOverlayCard() {
  return useOverlayChannelMutation((input: OverlayPush) => pushOverlayCardFn({ data: input }));
}

const pushOverlayBoardFn = createServerFn({ method: "POST" })
  .validator((input: OverlayPushBoard) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).pushBoard(data),
  );

export function usePushOverlayBoard() {
  return useOverlayChannelMutation((input: OverlayPushBoard) =>
    pushOverlayBoardFn({ data: input }),
  );
}

const setOverlayBoardRevealFn = createServerFn({ method: "POST" })
  .validator((input: OverlaySetBoardReveal) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).setBoardReveal(data),
  );

/** Sends the count alone, so holding Next does not put the whole ranking on the wire per press. */
export function useSetOverlayBoardReveal() {
  return useOverlayChannelMutation((input: OverlaySetBoardReveal) =>
    setOverlayBoardRevealFn({ data: input }),
  );
}

const setOverlayHiddenFn = createServerFn({ method: "POST" })
  .validator((input: OverlaySetHidden) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).setHidden(data),
  );

/** Unlike {@link useClearOverlay}, the card or board survives and returns when sent false. */
export function useSetOverlayHidden() {
  return useOverlayChannelMutation((input: OverlaySetHidden) =>
    setOverlayHiddenFn({ data: input }),
  );
}

const clearOverlayFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).clear(),
  );

export function useClearOverlay() {
  return useOverlayChannelMutation(() => clearOverlayFn());
}

const updateOverlaySettingsFn = createServerFn({ method: "POST" })
  .validator((input: OverlaySettings) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<OverlayChannelResponse> =>
    apiOrpcClient(overlayContract, context.cookie).updateSettings(data),
  );

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

export function useRotateOverlayToken() {
  return useOverlayChannelMutation(() => rotateOverlayTokenFn());
}
