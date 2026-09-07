import { createLazyFileRoute } from "@tanstack/react-router";

import { helpArticles } from "@/features/marketing/components/articles";
import { HelpArticlePage } from "@/features/marketing/components/help-article-page";

export const Route = createLazyFileRoute("/_app/help_/$slug")({
  component: HelpArticleRoute,
});

function HelpArticleRoute() {
  const { slug } = Route.useParams();
  // Loader already validates the slug and throws notFound(), so this is always defined
  const article = helpArticles.get(slug);
  if (!article) {
    return null;
  }

  return <HelpArticlePage article={article} />;
}
