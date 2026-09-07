import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { sessionQueryOptions } from "./auth-session";
import { captureHandledError } from "./report-error";
import { errorStatus, isApiError, isSessionExpiredError } from "./server-fns/api-error";
import { isStaleServerFnError, reloadIfStaleServerFnError } from "./stale-bundle-reload";
import { PERSISTENT_ERROR_TOAST } from "./toast";
import { toastableMessage } from "./toastable-message";

/**
 * react-query merges mutation options shallowly, so a mutation's own
 * `onError` overrides this default; such handlers must call this directly.
 */
export function reportMutationError(err: Error, queryClient: QueryClient): void {
  if (reloadIfStaleServerFnError(err)) {
    return;
  }
  if (isSessionExpiredError(err)) {
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  }
  const diagnostic = isApiError(err) ? err.diagnostic : undefined;
  if (diagnostic) {
    console.error(`[mutation error] ${err.message}\n\n${diagnostic}`, err);
  } else {
    console.error(err);
  }
  const status = errorStatus(err);
  if (status === undefined || status >= 500) {
    captureHandledError(err, { mutation: "true" });
  }
  toast.error(
    toastableMessage(err.message, "Something went wrong. Please try again."),
    PERSISTENT_ERROR_TOAST,
  );
}

/** Called once per request on the server, to avoid cross-request data leakage, and once on the client. */
export function createQueryClient() {
  const invalidateSession = () => {
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  };
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => {
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
        retry: (failureCount, error) =>
          !isSessionExpiredError(error) &&
          !isStaleServerFnError(error) &&
          globalThis.window !== undefined &&
          failureCount < 3,
      },
      mutations: {
        onError: (err) => reportMutationError(err, queryClient),
      },
    },
  });
  return queryClient;
}
