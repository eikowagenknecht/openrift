import { useQuery } from "@tanstack/react-query";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { fetchSession } from "./server-fns";

// Client-side auth client. Used for auth actions (signIn, signUp, signOut,
// email verification, password reset, etc.) which run exclusively in the
// browser. Session reads go through the fetchSession server function instead.
export const authClient = createAuthClient({
  baseURL: globalThis.document === undefined ? "http://unused" : globalThis.location.origin,
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut } = authClient;

// Read the session from the React Query cache. The root route's beforeLoad
// populates this via fetchSession() server function, so it's available
// immediately without a network call. Refetches go through the server
// function too (no direct /api calls from the browser).
export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => fetchSession(),
    staleTime: 60_000,
  });
}
