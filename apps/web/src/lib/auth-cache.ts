import type { QueryClient } from "@tanstack/react-query";

import { sessionQueryOptions } from "./auth-session";
import { cleanupCopiesCollection } from "./copies-collection";
import { cleanupDeckBuilderCollections } from "./deck-builder-collection";

// Call whenever the authenticated user changes (sign in, sign out, account
// deletion). Remove every non-session query so the new user can't see the
// previous user's cached collections, copies, decks, etc. (most have a
// staleTime > 0). Then reset the session query so active useSession observers
// refetch — queryClient.clear() removes the query without triggering a refetch,
// leaving the header stuck on the old auth state until a full reload.
//
// TanStack DB collections are also torn down: removeQueries clears the React
// Query cache but a Collection keeps its own copy of the rows and active
// useLiveQuery subscribers, so without an explicit cleanup() the sidebar and
// "all cards" view keep rendering the previous user's copies until reload.
export function clearUserScopedCache(queryClient: QueryClient) {
  const sessionKey = sessionQueryOptions().queryKey;
  cleanupCopiesCollection(queryClient);
  cleanupDeckBuilderCollections(queryClient);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionKey[0],
  });
  void queryClient.resetQueries({ queryKey: sessionKey });
}
