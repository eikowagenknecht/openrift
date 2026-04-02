import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeftIcon,
  LayersIcon,
  LibraryIcon,
  PrinterIcon,
  ScaleIcon,
  SwordsIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export interface HelpArticle {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
  component: () => Promise<{ default: ComponentType }>;
  /** When set, the article is only visible if this feature flag is enabled. */
  featureFlag?: string;
}

export const helpArticles = new Map<string, HelpArticle>([
  [
    "why-openrift",
    {
      slug: "why-openrift",
      title: "Why OpenRift?",
      description:
        "A transparent comparison with other Riftbound card browsers — what we do well and where we're still catching up.",
      icon: ScaleIcon,
      component: () => import("./articles/why-openrift"),
      featureFlag: "unfinished",
    },
  ],
  [
    "cards-printings-copies",
    {
      slug: "cards-printings-copies",
      title: "Cards, Printings & Copies",
      description:
        "Understand the difference between a card, a printing, and a copy — and how they show up in the browser and your collection.",
      icon: LayersIcon,
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
      icon: LibraryIcon,
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
      icon: ArrowRightLeftIcon,
      component: () => import("./articles/import-export"),
    },
  ],
  [
    "deck-building",
    {
      slug: "deck-building",
      title: "Building Decks",
      description:
        "Create decks, pick a legend, fill your zones, and validate against Standard format rules.",
      icon: SwordsIcon,
      component: () => import("./articles/deck-building"),
    },
  ],
  [
    "proxy-printing",
    {
      slug: "proxy-printing",
      title: "Printing Proxies",
      description:
        "Generate printable proxy PDFs from your decks for playtesting — with card images or text placeholders.",
      icon: PrinterIcon,
      component: () => import("./articles/proxy-printing"),
    },
  ],
]);

export const helpArticleList = [...helpArticles.values()];
