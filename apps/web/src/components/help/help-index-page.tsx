import { Link } from "@tanstack/react-router";
import { siDiscord } from "simple-icons";

import { Heading } from "@/components/heading";
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn, PAGE_PADDING } from "@/lib/utils";

import { helpArticleList } from "./articles";

export function HelpIndexPage() {
  const articles = helpArticleList.filter((article) => !article.featureFlag);

  return (
    <div className={cn("mx-auto w-full max-w-2xl flex-1", PAGE_PADDING)}>
      <div className="mb-6">
        <Heading level={1}>Help Center</Heading>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {articles.map((article) => (
          <CardLink
            key={article.slug}
            render={<Link to="/help/$slug" params={{ slug: article.slug }} />}
            size="sm"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <article.icon className="text-muted-foreground size-4" />
                {article.title}
              </CardTitle>
              <CardDescription>{article.description}</CardDescription>
            </CardHeader>
          </CardLink>
        ))}
      </div>

      <div className="text-muted-foreground mt-8 text-center text-sm">
        <p>
          Can&apos;t find what you&apos;re looking for?{" "}
          <a
            href={SOCIAL_LINKS.discordInvite}
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            <svg
              viewBox="0 0 24 24"
              className="mr-0.5 mb-px inline size-3.5 fill-current align-middle"
              aria-hidden="true"
            >
              <path d={siDiscord.path} />
            </svg>
            Ask on Discord
          </a>
        </p>
      </div>
    </div>
  );
}
