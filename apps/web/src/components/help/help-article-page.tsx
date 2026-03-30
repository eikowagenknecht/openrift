import { Link } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

import type { HelpArticle } from "./articles";

export function HelpArticlePage({ article }: { article: HelpArticle }) {
  const ArticleContent = lazy(article.component);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-3">
      <Link
        to="/help"
        className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
      >
        &larr; Help Center
      </Link>

      <h1 className="mb-6 text-2xl font-bold">{article.title}</h1>

      <Suspense>
        <ArticleContent />
      </Suspense>
    </div>
  );
}
