import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApi } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

// Verify admin before throwing so anonymous callers (or any non-admin with a
// session cookie) hitting this server function directly cannot spam Sentry.
async function assertAdmin(cookie: string): Promise<void> {
  await fetchApi({
    errorTitle: "Unauthorized",
    cookie,
    path: "/api/v1/admin/me",
    method: "GET",
  });
}

// ── SSR throw ───────────────────────────────────────────────────────────────
// Throws inside a TanStack Start server function so the Sentry global
// function-middleware captures it (service=web-ssr on the openrift-ssr project).

const throwInSsrFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await assertAdmin(context.cookie);
    throw new Error(`Sentry smoke test (web-ssr) @ ${new Date().toISOString()}`);
  });

export function useThrowInSsr() {
  return useMutation({ mutationFn: () => throwInSsrFn() });
}

// ── API throw ──────────────────────────────────────────────────────────────
// Hits an admin endpoint that throws; the API's Hono onError handler sends it
// to Sentry (openrift-api project). The server function itself does not throw.

const throwInApiFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApi({
      errorTitle: "API smoke test returned an error (expected)",
      cookie: context.cookie,
      path: "/api/v1/admin/sentry-test/throw",
      method: "POST",
    }),
  );

export function useThrowInApi() {
  return useMutation({ mutationFn: () => throwInApiFn() });
}
