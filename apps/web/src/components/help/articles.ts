import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeftIcon,
  BookOpenIcon,
  BotIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  PrinterIcon,
  PuzzleIcon,
  ScaleIcon,
  SwordsIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react";
import type { ComponentType } from "react";

import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled } from "@/lib/feature-flags";

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
        "A side-by-side comparison with other Riftbound card browsers: what OpenRift does well and where it's still catching up.",
      icon: ScaleIcon,
      component: () => import("./articles/why-openrift"),
    },
  ],
  [
    "how-to-play",
    {
      slug: "how-to-play",
      title: "How to Play Riftbound",
      description:
        "A short visual primer on the rules: how to win, what's in your deck, how a turn flows, and how battlefields are fought over.",
      icon: BookOpenIcon,
      component: () => import("./articles/how-to-play"),
      featureFlag: "help-how-to-play",
    },
  ],
  [
    "cards-printings-copies",
    {
      slug: "cards-printings-copies",
      title: "Cards, Printings & Copies",
      description: "What a card, a printing, and a copy are, and how the three levels connect.",
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
        "Organize cards by where they physically are (deck boxes, binders, or lent to friends) and control which are available for deck building.",
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
        "Move collections between OpenRift and other Riftbound tools (Piltover Archive, RiftCore, and more) using CSV.",
      icon: ArrowRightLeftIcon,
      component: () => import("./articles/import-export"),
    },
  ],
  [
    "deck-importer-extension",
    {
      slug: "deck-importer-extension",
      title: "Deck Importer Extension",
      description:
        "Send the decklist you're looking at on another site straight to OpenRift with one click, using the Firefox add-on.",
      icon: PuzzleIcon,
      component: () => import("./articles/deck-importer-extension"),
    },
  ],
  [
    "lists",
    {
      slug: "lists",
      title: "Wishlists & Tradelists",
      description:
        "Build, fill, and price the wishlists and tradelists that power group trading, including per-card overrides and the three list kinds.",
      icon: HeartIcon,
      component: () => import("./articles/lists"),
    },
  ],
  [
    "groups",
    {
      slug: "groups",
      title: "Groups",
      description:
        "Set up a closed circle of friends to share wishlists and tradelists, pool cards into shared collections, and see who has what you want.",
      icon: UsersIcon,
      component: () => import("./articles/groups"),
    },
  ],
  [
    "deck-building",
    {
      slug: "deck-building",
      title: "Building Decks",
      description:
        "Plan your deck by picking cards, filling zones, and validating against Constructed format rules.",
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
        "Print proxy PDFs from your decks for playtesting, with card images or text placeholders.",
      icon: PrinterIcon,
      component: () => import("./articles/proxy-printing"),
    },
  ],
  [
    "discord-bot",
    {
      slug: "discord-bot",
      title: "Discord Bot",
      description:
        "Add the OpenRift bot to your Discord server to look up cards, unfurl deck codes, and quote rules right from chat.",
      icon: BotIcon,
      component: () => import("./articles/discord-bot"),
    },
  ],
  [
    "tournament-decklist-api",
    {
      slug: "tournament-decklist-api",
      title: "Tournament Decklist API",
      description:
        "Push entrant decklists from your registration system into a tournament's deck check: API keys, the payload, claim links, and limits.",
      icon: WebhookIcon,
      component: () => import("./articles/tournament-decklist-api"),
    },
  ],
]);

export const helpArticleList = [...helpArticles.values()];

/**
 * The articles a visitor may see: unflagged ones always, flagged ones only
 * once their flag is on. Every surface that lists articles (the index, the FAQ
 * structured data) must go through this — filtering on the presence of
 * `featureFlag` alone hides an article even after its flag ships.
 *
 * @returns The visible articles, in declaration order.
 */
export function visibleHelpArticles(flags: FeatureFlags): HelpArticle[] {
  return helpArticleList.filter(
    (article) => !article.featureFlag || featureEnabled(flags, article.featureFlag),
  );
}
