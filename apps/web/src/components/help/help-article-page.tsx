import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Suspense, lazy } from "react";

import { Heading } from "@/components/heading";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

import type { HelpArticle } from "./articles";
import { helpArticles } from "./articles";

// One lazy component per article for the app's lifetime. Calling lazy() during
// render would hand Suspense a new component on every pass, re-mounting the
// article and re-running its import.
const ARTICLE_CONTENT: Record<string, ComponentType> = Object.fromEntries(
  [...helpArticles].map(([slug, entry]) => [slug, lazy(entry.component)]),
);

export function HelpArticlePage({ article }: { article: HelpArticle }) {
  const ArticleContent = ARTICLE_CONTENT[article.slug];

  return (
    <div className={cn(PAGE_WIDTH.capped, "flex-1", PAGE_PADDING)}>
      {/* The page is a capped column like every other non-grid page; the
          article stops at `max-w-prose` so the line length stays readable. */}
      <div className="mx-auto max-w-prose">
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

        <Heading level={1} className="mb-6">
          {article.title}
        </Heading>

        <Suspense>
          <ArticleContent />
        </Suspense>
      </div>
    </div>
  );
}
