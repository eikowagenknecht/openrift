import { createLazyFileRoute, notFound } from "@tanstack/react-router";

import { helpArticles } from "@/components/help/articles";
import { HelpArticlePage } from "@/components/help/help-article-page";
import { Footer } from "@/components/layout/footer";

export const Route = createLazyFileRoute("/_app/help_/$slug")({
  component: HelpArticleRoute,
});

function HelpArticleRoute() {
  const { slug } = Route.useParams();
  const article = helpArticles.get(slug);

  if (!article) {
    throw notFound();
  }

  return (
    <>
      <HelpArticlePage article={article} />
      <Footer />
    </>
  );
}
