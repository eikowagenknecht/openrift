import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { API_BASE, IS_PREVIEW } from "@/lib/api-base";

export const authClient = createAuthClient({
  baseURL: API_BASE || globalThis.location.origin,
  plugins: [emailOTPClient()],
  fetchOptions: IS_PREVIEW ? { credentials: "include" as RequestCredentials } : {},
});

export const { useSession, signIn, signUp, signOut } = authClient;
