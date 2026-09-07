import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApi } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

// Anonymous or non-admin callers hitting this server function directly must not spam Sentry.
async function assertAdmin(cookie: string): Promise<void> {
  await fetchApi({
    errorTitle: "Unauthorized",
    cookie,
    path: "/api/admin/v1/me",
    method: "GET",
  });
}

// Sentry's global function-middleware captures this (service=web-ssr, openrift-ssr project).
const throwInSsrFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(async ({ context }) => {
    await assertAdmin(context.cookie);
    throw new Error(`Sentry smoke test (web-ssr) @ ${new Date().toISOString()}`);
  });

export function useThrowInSsr() {
  return useMutation({ mutationFn: () => throwInSsrFn() });
}

// The API's Hono onError handler sends this to Sentry (openrift-api project);
// the server function itself does not throw.
const throwInApiFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(({ context }) =>
    fetchApi({
      errorTitle: "API smoke test returned an error (expected)",
      cookie: context.cookie,
      path: "/api/admin/v1/sentry-test/throw",
      method: "POST",
    }),
  );

export function useThrowInApi() {
  return useMutation({ mutationFn: () => throwInApiFn() });
}
