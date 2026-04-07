import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// On the client, use the browser origin. On the server (SSR), route auth
// requests through the internal API URL (same network as the RPC client).
const baseURL =
  "location" in globalThis ? globalThis.location.origin : process.env.API_INTERNAL_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});

export const { signIn, signUp, signOut } = authClient;
