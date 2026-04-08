import { createFileRoute, notFound } from "@tanstack/react-router";

import { helpArticles } from "@/components/help/articles";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { seoHead } from "@/lib/seo";

function slugToTitle(slug: string) {
  return slug.replaceAll("-", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

export const Route = createFileRoute("/_app/help_/$slug")({
  head: ({ params }) => {
    const article = helpArticles.get(params.slug);
    return seoHead({
      title: article ? `${article.title} — Help` : `${slugToTitle(params.slug)} — Help`,
      description: article?.description ?? `Help article: ${slugToTitle(params.slug)}.`,
      path: `/help/${params.slug}`,
    });
  },
  loader: async ({ params, context }) => {
    const article = helpArticles.get(params.slug);
    if (!article) {
      throw notFound();
    }
    if (article.featureFlag) {
      const flags = (await context.queryClient.ensureQueryData(
        featureFlagsQueryOptions,
      )) as FeatureFlags;
      if (!featureEnabled(flags, article.featureFlag)) {
        throw notFound();
      }
    }
  },
});
