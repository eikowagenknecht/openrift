import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { sessionQueryOptions } from "./auth-session";
import { isApiError, isSessionExpiredError } from "./server-fns/api-error";
import { PERSISTENT_ERROR_TOAST } from "./toast";

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
        if (isSessionExpiredError(err)) {
          invalidateSession();
        }
      },
    }),
    defaultOptions: {
      queries: {
        // Retrying a 401 can't succeed (the cookie stays invalid) and only
        // delays the session refetch → /login redirect. Everything else keeps
        // react-query's defaults: 3 retries in the browser, none during SSR.
        retry: (failureCount, error) =>
          !isSessionExpiredError(error) && globalThis.window !== undefined && failureCount < 3,
      },
      // Query errors are handled per-component via isError/error state.
      // Mutation errors show a global toast since the user expects feedback
      // on an action they triggered.
      mutations: {
        onError: (err) => {
          if (isSessionExpiredError(err)) {
            invalidateSession();
          }
          // fetchApi throws an ApiError whose `message` is the server's error
          // text (the user-facing toast) and whose `diagnostic` (method/url/
          // status/body) is for the console only. isApiError is structural
          // because the prototype is lost across the server-function boundary.
          const diagnostic = isApiError(err) ? err.diagnostic : undefined;
          if (diagnostic) {
            console.error(`[mutation error] ${err.message}\n\n${diagnostic}`, err);
          } else {
            console.error(err);
          }
          // Mutations are user-triggered actions; a failure that auto-dismisses
          // is easy to miss (an add/remove looks like it worked). Keep it up
          // until the user acknowledges it.
          toast.error(err.message, PERSISTENT_ERROR_TOAST);
        },
      },
    },
  });
  return queryClient;
}
