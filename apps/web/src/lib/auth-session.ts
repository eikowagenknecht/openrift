// Server-side auth session fetching via TanStack Start server functions.
// During SSR, the better-auth client can't forward cookies automatically.
// This server function reads cookies from the incoming request and forwards
// them to the API, so session checks work correctly during SSR.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApi } from "./server-fns/fetch-api";
import { withCookies } from "./server-fns/middleware";

/** User shape returned by better-auth's get-session endpoint. */
interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Session data returned by better-auth's get-session endpoint. */
type SessionData = {
  session: { id: string; userId: string; expiresAt: string; token: string };
  user: SessionUser;
} | null;

const getServerSession = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<SessionData> => {
    // 401 is the expected state for unauthenticated users — return null without
    // logging/throwing. Other non-ok statuses still surface as errors.
    const res = await fetchApi({
      errorTitle: "Couldn't load session",
      cookie: context.cookie,
      path: "/api/auth/get-session",
      acceptStatuses: [401],
    });
    if (!res.ok) {
      return null;
    }
    return res.json();
  });

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: () => getServerSession(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

/**
 * Drop-in replacement for better-auth's useSession(). Reads from the React
 * Query cache populated by the server function, so the session is available
 * during SSR (no flash of unauthenticated content).
 *
 * @returns Query result with the same { data, isPending } shape.
 */
export function useSession() {
  return useQuery(sessionQueryOptions());
}

/**
 * Returns the current user's id, or null when signed out / still loading.
 * Use for hooks that may run on public pages where authentication is
 * optional (e.g. owned-count chips on /cards).
 *
 * @returns The current user id, or null when no one is signed in.
 */
export function useUserId(): string | null {
  const { data: session } = useSession();
  return session?.user?.id ?? null;
}

/**
 * Returns the current user's id, throwing if no one is signed in. Use for
 * hooks that only run on routes guarded by `_authenticated` — the route
 * guard already redirects unauthenticated users, so reaching this branch
 * indicates a programming error (called from a public route).
 *
 * @returns The current user id.
 */
export function useRequiredUserId(): string {
  const userId = useUserId();
  if (!userId) {
    throw new Error(
      "useRequiredUserId() called without an authenticated session. " +
        "Move this call inside an `_authenticated` route, or switch to useUserId() and handle the null case.",
    );
  }
  return userId;
}
