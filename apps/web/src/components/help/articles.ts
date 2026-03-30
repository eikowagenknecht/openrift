import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import type { ComponentType } from "react";

export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  component: () => Promise<{ default: ComponentType }>;
}

export const helpArticles = new Map<string, HelpArticle>([
  [
    "cards-printings-copies",
    {
      slug: "cards-printings-copies",
      title: "Cards, Printings & Copies",
      description:
        "Understand the difference between a card, a printing, and a copy \u2014 and how they show up in the browser and your collection.",
      icon: Layers,
      component: () => import("./articles/cards-printings-copies"),
    },
  ],
]);

export const helpArticleList = [...helpArticles.values()];
