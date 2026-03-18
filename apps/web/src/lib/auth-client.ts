import { queryOptions } from "@tanstack/react-query";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Build an auth client for the given origin. On the server, pass the
 * request origin; on the client the default uses window.location.origin.
 * @returns A configured Better Auth client instance.
 */
function createAppAuthClient(baseURL: string) {
  return createAuthClient({ baseURL, plugins: [emailOTPClient()] });
}

export const authClient = createAppAuthClient(
  globalThis.window === undefined ? "" : globalThis.location.origin,
);

export const { useSession, signIn, signUp, signOut } = authClient;

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await authClient.getSession();
      return data;
    },
  });
