import { queryOptions } from "@tanstack/react-query";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// On the client, use the browser origin. On the server (SSR), route auth
// requests through the internal API URL (same network as the RPC client).
const baseURL =
  "location" in globalThis
    ? globalThis.location.origin
    : (process.env.API_INTERNAL_URL ?? "http://localhost:3000");

export const authClient = createAuthClient({
  baseURL,
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
