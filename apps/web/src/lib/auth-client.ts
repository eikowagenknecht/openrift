import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// On the client, use the browser origin. On the server (SSR), route auth
// requests through the internal API URL (same network as the RPC client).
const baseURL =
  "location" in globalThis ? globalThis.location.origin : process.env.API_INTERNAL_URL;

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    emailOTPClient(),
    // Mirrors the server's user.additionalFields (apps/api/src/auth.ts) so the
    // session user and updateUser are typed with them.
    inferAdditionalFields({
      user: {
        riotId: { type: "string", required: false },
      },
    }),
  ],
});

export const { signIn, signUp, signOut } = authClient;
