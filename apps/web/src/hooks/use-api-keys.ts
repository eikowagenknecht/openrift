import type { ApiKey } from "@better-auth/api-key";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** A listed key: the server strips the hashed `key` field from list responses. */
export type ApiKeySummary = Omit<ApiKey, "key">;

/**
 * Unwraps a better-auth client result, throwing its error so TanStack Query
 * sees failures instead of a `{ data, error }` envelope.
 *
 * @returns The result's data.
 */
export function unwrapAuthResult<T>(result: {
  data: T | null;
  error: { message?: string | undefined; statusText: string } | null;
}): T {
  if (result.error) {
    throw new Error(result.error.message ?? result.error.statusText);
  }
  // better-auth returns exactly one of data/error; data is set when error is null.
  return result.data as T;
}

/**
 * The current user's API keys (hashed server-side; only name/start metadata
 * comes back). Client-only: better-auth calls carry the browser session
 * cookie, which SSR loaders don't have.
 *
 * @returns The API key list query.
 */
export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.admin.apiKeys,
    queryFn: async (): Promise<ApiKeySummary[]> =>
      unwrapAuthResult(await authClient.apiKey.list()).apiKeys,
  });
}

/**
 * Creates an API key for the current user. The response's `key` field is the
 * plaintext key, shown exactly once.
 *
 * @returns The create mutation.
 */
export function useCreateApiKey() {
  return useMutationWithInvalidation({
    mutationFn: async (input: { name: string }) =>
      unwrapAuthResult(await authClient.apiKey.create({ name: input.name })),
    invalidates: [queryKeys.admin.apiKeys],
  });
}

/**
 * Revokes (deletes) one of the current user's API keys.
 *
 * @returns The delete mutation.
 */
export function useDeleteApiKey() {
  return useMutationWithInvalidation({
    mutationFn: async (input: { keyId: string }) =>
      unwrapAuthResult(await authClient.apiKey.delete({ keyId: input.keyId })),
    invalidates: [queryKeys.admin.apiKeys],
  });
}
