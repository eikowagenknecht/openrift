import type { QueryClient } from "@tanstack/react-query";

// Call whenever the authenticated user changes (sign in, sign out, account
// deletion). Most user-scoped queries have a staleTime longer than zero
// (e.g. collections is 5min), so without a full clear the new user would see
// the previous user's cached collections, copies, decks, preferences, etc.
export function clearUserScopedCache(queryClient: QueryClient) {
  queryClient.clear();
}
