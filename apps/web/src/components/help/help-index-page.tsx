import { Link } from "@tanstack/react-router";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";

import type { HelpArticle } from "./articles";
import { helpArticleList } from "./articles";

function useVisibleArticles(): HelpArticle[] {
  const unfinishedEnabled = useFeatureEnabled("unfinished");

  return helpArticleList.filter(
    (article) =>
      !article.featureFlag || (article.featureFlag === "unfinished" && unfinishedEnabled),
  );
}

export function HelpIndexPage() {
  const articles = useVisibleArticles();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-3">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Help Center</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Learn how OpenRift works and get the most out of your collection.
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
    </div>
  );
}
