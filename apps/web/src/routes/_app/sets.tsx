import type { SetListResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const SETS_DESCRIPTION =
  "Browse all Riftbound card sets. View cards, printings, and details for each set.";

export const Route = createFileRoute("/_app/sets")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const data = loaderData as SetListResponse | undefined;
    const head = seoHead({
      siteUrl,
      title: "Riftbound Card Sets",
      description: SETS_DESCRIPTION,
      path: "/sets",
    });
    return {
      ...head,
      scripts: [
        collectionPageJsonLd({
          siteUrl,
          name: "Riftbound Card Sets",
          description: SETS_DESCRIPTION,
          path: "/sets",
          items: (data?.sets ?? []).map((set) => ({
            name: set.name,
            url: `/sets/${set.slug}`,
            image: set.coverImageId ? imageUrl(set.coverImageId, "full") : undefined,
          })),
        }),
      ],
    };
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSetListQueryOptions),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
});
