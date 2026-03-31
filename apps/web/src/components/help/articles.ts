import type { LucideIcon } from "lucide-react";
import { ArrowRightLeft, Layers, Library } from "lucide-react";
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
        "Understand the difference between a card, a printing, and a copy — and how they show up in the browser and your collection.",
      icon: Layers,
      component: () => import("./articles/cards-printings-copies"),
    },
  ],
  [
    "collections",
    {
      slug: "collections",
      title: "Managing Your Collection",
      description:
        "Create collections, add cards, drag & drop between collections, and use bulk actions to stay organized.",
      icon: Library,
      component: () => import("./articles/collections"),
    },
  ],
  [
    "import-export",
    {
      slug: "import-export",
      title: "Importing & Exporting",
      description:
        "Bring cards in from other tools via CSV, review how matching works, and export your collection.",
      icon: ArrowRightLeft,
      component: () => import("./articles/import-export"),
    },
  ],
]);

export const helpArticleList = [...helpArticles.values()];
