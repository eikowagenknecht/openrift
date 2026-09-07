import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { cardSubmissionsQueryOptions } from "@/features/contribute/hooks/use-card-submissions";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute_/submissions")({
  ssr: "data-only",
  beforeLoad: async ({ location, context }) => {
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
    return { userId: session.user.id };
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "My card submissions", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.infiniteQuery({
      ...cardSubmissionsQueryOptions(context.userId),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
