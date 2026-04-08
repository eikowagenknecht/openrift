// Server-side auth session fetching via TanStack Start server functions.
// During SSR, the better-auth client can't forward cookies automatically.
// This server function reads cookies from the incoming request and forwards
// them to the API, so session checks work correctly during SSR.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { API_URL } from "./server-fns/api-url";
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
export type SessionData = {
  session: { id: string; userId: string; expiresAt: string; token: string };
  user: SessionUser;
} | null;

const getServerSession = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<SessionData> => {
    const res = await fetch(`${API_URL}/api/auth/get-session`, {
      headers: { cookie: context.cookie },
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
