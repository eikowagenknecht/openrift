import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions, decksQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

/** `from` is the older side of the comparison; the route param is the newer one. */
const changesSearchSchema = z.object({ from: z.uuid() });

export const Route = createFileRoute("/_app/decks/$deckId_/changes")({
  ssr: "data-only",
  validateSearch: changesSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck Changes", noIndex: true }),
  loaderDeps: ({ search }) => ({ from: search.from }),
  // Both sides are server decks: a browser-local deck has no variant family, so
  // there is nothing here to compare it against.
  loader: async ({ context, params, location, deps }) => {
    if (isLocalDeckId(params.deckId) || isLocalDeckId(deps.from)) {
      throw notFound();
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
        context.queryClient.ensureQueryData(deckDetailQueryOptions(session.user.id, deps.from)),
        context.queryClient.ensureQueryData(decksQueryOptions(session.user.id)),
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
