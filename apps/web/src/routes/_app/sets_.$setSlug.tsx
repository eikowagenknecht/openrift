import type { SetDetailResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/sets_/$setSlug")({
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const data = loaderData as SetDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Set" });
    }

    const cardCount = new Set(data.printings.map((p) => p.cardId)).size;
    const setPath = `/sets/${data.set.slug}`;
    const head = seoHead({
      siteUrl,
      title: `${data.set.name} — Riftbound Card Set`,
      description: `${data.set.name} contains ${cardCount} unique cards and ${data.printings.length} printings. Browse the complete set on OpenRift.`,
      path: setPath,
    });

    return {
      ...head,
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Sets", path: "/sets" },
          { name: data.set.name, path: setPath },
        ]),
      ],
    };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(publicSetDetailQueryOptions(params.setSlug)),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
