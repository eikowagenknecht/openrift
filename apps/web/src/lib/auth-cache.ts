import type { QueryClient } from "@tanstack/react-query";

import { sessionQueryOptions } from "./auth-session";

// Call whenever the authenticated user changes (sign in, sign out, account
// deletion). Drops every non-session query so the prior user's cached
// collections / copies / decks can't survive across the boundary, tears down
// the user-scoped TanStack DB collections so their in-memory rows don't
// leak through useLiveQuery, and refetches the session query so active
// useSession observers see the new auth state.
//
// Sign-out callers MUST `await router.navigate(...)` to a public route
// before invoking this — the user-scoped useLiveQuery hooks (collection
// grid, sidebar, owned-count chips, dispose picker) live on authenticated
// routes and only detach when the route unmounts. The cleanup helpers
// internally wait for subscriberCount to drop to 0 before calling
// collection.cleanup() (which transitions attached live queries to error
// state and floods the console with [Live Query Error] warnings) — but
// they need the route to actually start unmounting first.
//
// Sign-in callers run from public auth pages (/login, /verify-email) where
// no user-scoped live query is mounted, so the wait resolves immediately.
//
// The collection cleanup helpers are loaded lazily so anonymous visitors —
// whose pages never call this function — don't pay for `@tanstack/react-db`
// in the initial bundle.
export async function clearUserScopedCache(queryClient: QueryClient): Promise<void> {
  const sessionKey = sessionQueryOptions().queryKey;
  // Sync flip session to null so useSession() observers re-render as logged
  // out immediately. resetQueries below triggers a refetch — for sign-out
  // it returns null again (cookie is gone); for sign-in it fetches the new
  // user, briefly overwriting this null.
  queryClient.setQueryData(sessionKey, null);
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== sessionKey[0],
  });
  const [{ cleanupCopiesCollection }, { cleanupDeckBuilderCollections }] = await Promise.all([
    import("./copies-collection"),
    import("./deck-builder-collection"),
  ]);
  await cleanupCopiesCollection(queryClient);
  await cleanupDeckBuilderCollections(queryClient);
  void queryClient.resetQueries({ queryKey: sessionKey });
}
