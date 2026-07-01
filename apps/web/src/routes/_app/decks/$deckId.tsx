import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

export const Route = createFileRoute("/_app/decks/$deckId")({
  ssr: "data-only",
  validateSearch: filterSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck Editor", noIndex: true }),
  staticData: { hideFooter: true },
  // Auth-optional (ADR-035), branching on the id:
  //  - `local:` id → no server fetch (cards live in the browser); the editor
  //    reads them client-side after hydration.
  //  - server id + session → today's server deck-detail path.
  //  - server id + no session → redirect to /login, preserving `redirect` so a
  //    bookmarked/shared authenticated deck link still works after sign-in.
  loader: async ({ context, params, location }) => {
    if (isLocalDeckId(params.deckId)) {
      await context.queryClient.ensureQueryData(initQueryOptions);
      return;
    }
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(deckDetailQueryOptions(session.user.id, params.deckId)),
        context.queryClient.ensureQueryData(initQueryOptions),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});
