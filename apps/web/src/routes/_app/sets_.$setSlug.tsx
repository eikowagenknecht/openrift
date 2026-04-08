import type { SetDetailResponse } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";

const SITE_URL = "https://openrift.app";

export const Route = createFileRoute("/_app/sets_/$setSlug")({
  head: ({ loaderData }) => {
    const data = loaderData as SetDetailResponse | undefined;
    if (!data) {
      return { meta: [{ title: "Set — OpenRift" }] };
    }

    const cardCount = new Set(data.printings.map((p) => p.cardId)).size;
    const description = `${data.set.name} contains ${cardCount} unique cards and ${data.printings.length} printings. Browse the complete set on OpenRift.`;
    const canonicalUrl = `${SITE_URL}/sets/${data.set.slug}`;

    return {
      meta: [
        { title: `${data.set.name} — Riftbound Card Set | OpenRift` },
        { name: "description", content: description },
        { property: "og:title", content: `${data.set.name} — Riftbound Card Set` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl },
      ],
      links: [{ rel: "canonical", href: canonicalUrl }],
    };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(publicSetDetailQueryOptions(params.setSlug)),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
