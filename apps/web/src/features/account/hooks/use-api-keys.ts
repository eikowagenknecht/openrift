import type { ApiKey } from "@better-auth/api-key";
import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/features/account/lib/auth-client";
import { adminKeys } from "@/features/admin/lib/admin-query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

/** A listed key: the server strips the hashed `key` field from list responses. */
export type ApiKeySummary = Omit<ApiKey, "key">;

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

/** Client-only: better-auth calls carry the browser session cookie, which SSR loaders don't have. */
export function useApiKeys() {
  return useQuery({
    queryKey: adminKeys.apiKeys,
    queryFn: async (): Promise<ApiKeySummary[]> =>
      unwrapAuthResult(await authClient.apiKey.list()).apiKeys,
  });
}

/**
 * Creates an API key for the current user. The response's `key` field is the
 * plaintext key, shown exactly once.
 */
export function useCreateApiKey() {
  return useMutationWithInvalidation({
    mutationFn: async (input: { name: string }) =>
      unwrapAuthResult(await authClient.apiKey.create({ name: input.name })),
    invalidates: [adminKeys.apiKeys],
  });
}

/**
 * Revokes (deletes) one of the current user's API keys.
 */
export function useDeleteApiKey() {
  return useMutationWithInvalidation({
    mutationFn: async (input: { keyId: string }) =>
      unwrapAuthResult(await authClient.apiKey.delete({ keyId: input.keyId })),
    invalidates: [adminKeys.apiKeys],
  });
}
