import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { cleanedSearchForRedirect, filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

export const Route = createFileRoute("/_app/decks/$deckId")({
  ssr: "data-only",
  validateSearch: filterSearchSchema,
  beforeLoad: ({ search, location, params }) => {
    const cleaned = cleanedSearchForRedirect(filterSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({
        to: "/decks/$deckId",
        params: { deckId: params.deckId },
        search: cleaned,
        replace: true,
      });
    }
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck Editor", noIndex: true }),
  staticData: { hideFooter: true },
  // Auth is optional: a `local:` id needs no server fetch; a server id with no
  // session redirects to /login, preserving `redirect` for post-login return.
  loader: async ({ context, params, location }) => {
    if (isLocalDeckId(params.deckId)) {
      await context.queryClient.query({ ...initQueryOptions, staleTime: "static" });
      return;
    }
    const session = await context.queryClient.query({
      ...sessionQueryOptions(),
      staleTime: "static",
    });
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
    try {
      await Promise.all([
        context.queryClient.query({
          ...deckDetailQueryOptions(session.user.id, params.deckId),
          staleTime: "static",
        }),
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
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
