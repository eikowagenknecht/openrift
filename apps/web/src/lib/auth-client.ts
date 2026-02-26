import { createAuthClient } from "better-auth/react";

import { API_BASE } from "@/lib/api-base";

export const authClient = createAuthClient({
  baseURL: API_BASE || window.location.origin,
});

export const { useSession, signIn, signUp, signOut } = authClient;
