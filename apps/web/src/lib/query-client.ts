import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Server-function errors thrown via fetchApi encode structured detail into
// the error message: "<title>\n---\n<details>". Split here so the toast stays
// short and the full diagnostic (URL, status, response body) lands in the
// browser console — copyable from devtools.
const ERROR_DETAILS_SEPARATOR = "\n---\n";

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
          const [title, ...rest] = err.message.split(ERROR_DETAILS_SEPARATOR);
          if (rest.length > 0) {
            console.error(
              `[mutation error] ${title}\n\n${rest.join(ERROR_DETAILS_SEPARATOR)}`,
              err,
            );
          } else {
            console.error(err);
          }
          toast.error(title);
        },
      },
    },
  });
}
