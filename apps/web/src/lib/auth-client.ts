import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { API_BASE } from "@/lib/api-base";

export const authClient = createAuthClient({
  baseURL: API_BASE || globalThis.location.origin,
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
