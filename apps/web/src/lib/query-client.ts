import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { isApiError } from "./server-fns/api-error";

/**
 * Factory for QueryClient — called once per request on the server (to avoid
 * cross-request data leakage) and once on the client.
 * @returns A new QueryClient instance with default error handling.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Query errors are handled per-component via isError/error state.
      // Mutation errors show a global toast since the user expects feedback
      // on an action they triggered.
      mutations: {
        onError: (err) => {
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
          toast.error(err.message);
        },
      },
    },
  });
}
