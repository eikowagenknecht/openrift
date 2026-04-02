import { createLazyFileRoute, notFound } from "@tanstack/react-router";

import { helpArticles } from "@/components/help/articles";
import { HelpArticlePage } from "@/components/help/help-article-page";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

export const Route = createLazyFileRoute("/_app/help_/$slug")({
  component: HelpArticleRoute,
});

function HelpArticleRoute() {
  const { slug } = Route.useParams();
  const article = helpArticles.get(slug);
  const unfinishedEnabled = useFeatureEnabled("unfinished");

  if (!article || (article.featureFlag === "unfinished" && !unfinishedEnabled)) {
    throw notFound();
  }

  return <HelpArticlePage article={article} />;
}
