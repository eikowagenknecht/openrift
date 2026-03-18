import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Factory for QueryClient — called once per request on the server (to avoid
 * cross-request data leakage) and once on the client.
 * @returns A new QueryClient instance with default error handling.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        onError: (err) => toast.error(err.message),
      },
    },
  });
}
