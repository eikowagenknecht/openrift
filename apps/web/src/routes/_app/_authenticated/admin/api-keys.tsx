import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminSeoHead } from "@/lib/seo";

// No loader: the key list is fetched client-side via better-auth (the
// session cookie isn't available to SSR loaders).
export const Route = createFileRoute("/_app/_authenticated/admin/api-keys")({
  head: () => adminSeoHead("API Keys"),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
