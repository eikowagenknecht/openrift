import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: globalThis.location.origin,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
