import { queryOptions } from "@tanstack/react-query";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// SSR migration note:
// This is a browser-only auth client. When migrating to TanStack Start,
// server-side session checks should use createServerFn + auth.api.getSession()
// with forwarded request headers (see https://better-auth.com/docs/integrations/tanstack).
// The sessionQueryOptions pattern below would be replaced by server functions
// that read cookies from the request directly — no browser fetch during SSR.

export const authClient = createAuthClient({
  baseURL: globalThis.location.origin,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await authClient.getSession();
      return data;
    },
  });
