import { createFileRoute, notFound } from "@tanstack/react-router";

import { helpArticles } from "@/components/help/articles";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { articleJsonLd, breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

function slugToTitle(slug: string) {
  return slug.replaceAll("-", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

export const Route = createFileRoute("/_app/help_/$slug")({
  head: ({ params }) => {
    const siteUrl = getSiteUrl();
    const article = helpArticles.get(params.slug);
    const head = seoHead({
      siteUrl,
      title: article ? `${article.title} — Help` : `${slugToTitle(params.slug)} — Help`,
      description: article?.description ?? `Help article: ${slugToTitle(params.slug)}.`,
      path: `/help/${params.slug}`,
    });
    if (!article) {
      return head;
    }
    const articlePath = `/help/${article.slug}`;
    return {
      ...head,
      scripts: [
        articleJsonLd({
          siteUrl,
          headline: article.title,
          description: article.description,
          path: articlePath,
        }),
        breadcrumbJsonLd(siteUrl, [
          { name: "Help", path: "/help" },
          { name: article.title, path: articlePath },
        ]),
      ],
    };
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
