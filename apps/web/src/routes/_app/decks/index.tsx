import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { decksQueryOptions } from "@/hooks/use-decks";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/decks/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Decks", noIndex: true }),
  // Auth-optional (ADR-035): logged-out visitors see their browser-local decks
  // (client-side). Only prefetch the server deck list when a session exists.
  loader: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session?.user) {
      await context.queryClient.ensureQueryData(decksQueryOptions(session.user.id));
    }
  },
  errorComponent: RouteErrorFallback,
});
