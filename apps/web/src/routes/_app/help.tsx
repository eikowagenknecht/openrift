import { createFileRoute } from "@tanstack/react-router";

import { helpArticleList } from "@/components/help/articles";
import { faqPageJsonLd, seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/help")({
  head: () => ({
    ...seoHead({
      title: "Help",
      description:
        "Guides and frequently asked questions for OpenRift, including collection management, deck building, and import/export.",
      path: "/help",
    }),
    scripts: [
      faqPageJsonLd(
        helpArticleList
          .filter((a) => !a.featureFlag)
          .map((a) => ({ question: a.title, answer: a.description })),
      ),
    ],
  }),
});
