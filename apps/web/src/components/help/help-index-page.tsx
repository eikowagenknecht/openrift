import { Link } from "@tanstack/react-router";
import { siDiscord } from "simple-icons";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { PAGE_PADDING } from "@/lib/utils";

import type { HelpArticle } from "./articles";
import { helpArticleList } from "./articles";

function useVisibleArticles(): HelpArticle[] {
  const helpEnabled = useFeatureEnabled("help");

  return helpArticleList.filter(
    (article) => !article.featureFlag || (article.featureFlag === "help" && helpEnabled),
  );
}

export function HelpIndexPage() {
  const articles = useVisibleArticles();

  return (
    <div className={`mx-auto w-full max-w-2xl flex-1 ${PAGE_PADDING}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Help Center</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything you need to know about managing cards, building decks, and more.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((article) => (
          <Link key={article.slug} to="/help/$slug" params={{ slug: article.slug }}>
            <Card className="hover:bg-muted/50 h-full transition-colors" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <article.icon className="text-muted-foreground size-4" />
                  {article.title}
                </CardTitle>
                <CardDescription>{article.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="text-muted-foreground mt-8 text-center text-sm">
        <p>
          Can&apos;t find what you&apos;re looking for?{" "}
          <a
            href="https://discord.gg/Qb6RcjXq6z"
            target="_blank"
            rel="noreferrer"
            className="text-foreground inline-flex items-center gap-1 hover:underline"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
              <path d={siDiscord.path} fill="currentColor" />
            </svg>
            Ask us on Discord
          </a>
        </p>
      </div>
    </div>
  );
}
