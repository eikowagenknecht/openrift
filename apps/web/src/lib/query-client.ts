import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { sessionQueryOptions } from "./auth-session";
import { captureHandledError } from "./report-error";
import { errorStatus, isApiError, isSessionExpiredError } from "./server-fns/api-error";
import { isStaleServerFnError, reloadIfStaleServerFnError } from "./stale-bundle-reload";
import { PERSISTENT_ERROR_TOAST } from "./toast";
import { toastableMessage } from "./toastable-message";

/**
 * The failure path for a mutation: reload on a stale bundle, refetch the
 * session on a 401, log the diagnostic, report the unexpected ones to Sentry,
 * and raise the persistent error toast.
 *
 * Installed as the QueryClient's default mutation `onError`, and exported
 * because react-query merges mutation options shallowly — a mutation that
 * declares its own `onError` (to roll an optimistic update back) *replaces*
 * the default instead of running alongside it. Those handlers call this
 * directly, or the user watches the change revert with nothing explaining why.
 * @returns Nothing.
 */
export function reportMutationError(err: Error, queryClient: QueryClient): void {
  // Reload instead of toasting a framework-internal message at the user when
  // their bundle is stale (same as the query cache onError in createQueryClient).
  if (reloadIfStaleServerFnError(err)) {
    return;
  }
  if (isSessionExpiredError(err)) {
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  }
  // fetchApi throws an ApiError whose `message` is the server's error text
  // (the user-facing toast) and whose `diagnostic` (method/url/status/body) is
  // for the console only. isApiError is structural because the prototype is
  // lost across the server-function boundary.
  const diagnostic = isApiError(err) ? err.diagnostic : undefined;
  if (diagnostic) {
    console.error(`[mutation error] ${err.message}\n\n${diagnostic}`, err);
  } else {
    console.error(err);
  }
  // Call sites catch their own rejections, so this is the last place a failure
  // can reach Sentry; a 4xx is correctable input the toast already explains.
  const status = errorStatus(err);
  if (status === undefined || status >= 500) {
    captureHandledError(err, { mutation: "true" });
  }
  // Mutations are user-triggered actions; a failure that auto-dismisses is easy
  // to miss (an add/remove looks like it worked). Keep it up until the user
  // acknowledges it.
  toast.error(
    toastableMessage(err.message, "Something went wrong. Please try again."),
    PERSISTENT_ERROR_TOAST,
  );
}

/**
 * Factory for QueryClient — called once per request on the server (to avoid
 * cross-request data leakage) and once on the client.
 *
 * Any query or mutation failing with a 401 means the session expired or was
 * revoked while its cached copy still says "signed in" (the session query has
 * a 5-minute staleTime). Invalidating the session query makes it refetch and
 * resolve to null, which the `_authenticated` layout turns into a redirect to
 * /login — instead of the error surfacing as a crashed route.
 * @returns A new QueryClient instance with default error handling.
 */
export function createQueryClient() {
  const invalidateSession = () => {
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => {
        // A stale client bundle calling a server function the deployed server
        // no longer has reloads to reconcile. Critical for polling queries
        // (tournament deck-check refetches every 5s): they never navigate, so
        // the soft toast path can't recover them, and each failed tick is a
        // fresh SSR Sentry event until the reload fires.
        if (reloadIfStaleServerFnError(err)) {
          return;
        }
        if (isSessionExpiredError(err)) {
          invalidateSession();
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Retrying a 401 can't succeed (the cookie stays invalid) and only
        // delays the session refetch → /login redirect. A stale-server-fn error
        // can't succeed either — the manifest entry is gone until reload — so
        // skip it too rather than fire three more failing SSR calls. Everything
        // else keeps react-query's defaults: 3 retries in the browser, none
        // during SSR.
        retry: (failureCount, error) =>
          !isSessionExpiredError(error) &&
          !isStaleServerFnError(error) &&
          globalThis.window !== undefined &&
          failureCount < 3,
      },
      // Query errors are handled per-component via isError/error state.
      // Mutation errors show a global toast since the user expects feedback
      // on an action they triggered.
      mutations: {
        onError: (err) => reportMutationError(err, queryClient),
      },
    },
  });
  return queryClient;
}
