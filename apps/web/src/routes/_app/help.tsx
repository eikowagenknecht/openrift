import { createFileRoute } from "@tanstack/react-router";

import { visibleHelpArticles } from "@/components/help/articles";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureFlagsQueryOptions } from "@/lib/feature-flags";
import { faqPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/help")({
  loader: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    return {
      articles: visibleHelpArticles(flags).map(({ title, description }) => ({
        title,
        description,
      })),
    };
  },
  head: ({ loaderData }) => ({
    ...seoHead({
      siteUrl: getSiteUrl(),
      title: "Help",
      description:
        "Guides and frequently asked questions for OpenRift, including collection management, deck building, and import/export.",
      path: "/help",
    }),
    scripts: [
      faqPageJsonLd(
        (loaderData?.articles ?? []).map((a) => ({ question: a.title, answer: a.description })),
      ),
    ],
  }),
});
