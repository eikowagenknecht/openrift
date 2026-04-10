import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Suspense, lazy } from "react";

import { PAGE_PADDING } from "@/lib/utils";

import type { HelpArticle } from "./articles";

export function HelpArticlePage({ article }: { article: HelpArticle }) {
  const ArticleContent = lazy(article.component);

  return (
    <div className={`mx-auto w-full max-w-2xl flex-1 ${PAGE_PADDING}`}>
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="text-muted-foreground flex items-center gap-1 text-sm">
          <li>
            <Link to="/help" className="hover:text-foreground transition-colors">
              Help
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRightIcon className="size-3.5" />
          </li>
          <li>
            <span className="text-foreground" aria-current="page">
              {article.title}
            </span>
          </li>
        </ol>
      </nav>

      <h1 className="mb-6 text-2xl font-bold">{article.title}</h1>

      <Suspense>
        <ArticleContent />
      </Suspense>
    </div>
  );
}
