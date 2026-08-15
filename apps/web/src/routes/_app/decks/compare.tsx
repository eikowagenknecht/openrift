import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions, decksQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

/**
 * Both sides of the comparison, older on the left. Neither belongs in the path:
 * the page is about the pair, and either one can be re-picked without leaving
 * it. Either may be missing (a comparison opened from the deck menu starts with
 * only the deck you came from) and either may be a `local:` id, so this is not
 * a uuid check.
 */
const compareSearchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_app/decks/compare")({
  ssr: "data-only",
  validateSearch: compareSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Compare decks", noIndex: true }),
  loaderDeps: ({ search }) => ({ from: search.from, to: search.to }),
  // Auth-optional (ADR-035), the same branch the deck editor takes: a
  // comparison between browser-local decks needs no session, and those sides
  // resolve client-side from the store.
  loader: async ({ context, location, deps }) => {
    await context.queryClient.ensureQueryData(initQueryOptions);
    const serverIds = [deps.from, deps.to].filter(
      (id): id is string => id !== undefined && !isLocalDeckId(id),
    );
    if (serverIds.length === 0) {
      return;
    }
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
    const userId = session.user.id;
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(decksQueryOptions(userId)),
        ...serverIds.map((id) =>
          context.queryClient.ensureQueryData(deckDetailQueryOptions(userId, id)),
        ),
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
