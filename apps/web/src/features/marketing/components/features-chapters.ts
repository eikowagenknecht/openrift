import type { LucideIcon } from "lucide-react";
import {
  ArrowDownUpIcon,
  BookOpenIcon,
  BoxIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  HandHeartIcon,
  LayersIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListChecksIcon,
  ListOrderedIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  PaintbrushIcon,
  ScanLineIcon,
  Share2Icon,
  SparklesIcon,
  SwordsIcon,
  TicketIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";

import { getDomainColor } from "@/lib/domain";

interface ChapterFeatureLink {
  /** Without the `#`. */
  hash: string;
  label: string;
  icon: LucideIcon;
}

export interface FeatureChapter {
  id: string;
  number: string;
  title: string;
  tagline: string;
  glowColor: string;
  icon: LucideIcon;
  features: ChapterFeatureLink[];
}

export function chapterAnchor(id: string): string {
  return `chapter-${id}`;
}

export const FEATURE_CHAPTERS: FeatureChapter[] = [
  {
    id: "collect",
    number: "01",
    title: "Collect",
    tagline: "Browse the catalog, scan cards, and track your collection.",
    glowColor: getDomainColor("order"),
    icon: LibraryIcon,
    features: [
      { hash: "catalog", label: "Catalog", icon: LayoutGridIcon },
      { hash: "import", label: "Import", icon: ArrowDownUpIcon },
      { hash: "scan", label: "Scanner", icon: ScanLineIcon },
      { hash: "collections", label: "Collections", icon: LibraryIcon },
      { hash: "lists", label: "Lists", icon: ListChecksIcon },
      { hash: "prices", label: "Prices", icon: TrendingUpIcon },
      { hash: "promos", label: "Promos", icon: TicketIcon },
    ],
  },
  {
    id: "build",
    number: "02",
    title: "Build",
    tagline: "Draft a deck, try variants, and test hands before you sleeve up.",
    glowColor: getDomainColor("mind"),
    icon: LayersIcon,
    features: [
      { hash: "decks", label: "Decks", icon: LayersIcon },
      { hash: "variants", label: "Variants", icon: GitBranchIcon },
      { hash: "test", label: "Test bench", icon: FlaskConicalIcon },
      { hash: "box", label: "Deck box", icon: BoxIcon },
    ],
  },
  {
    id: "play",
    number: "03",
    title: "Play",
    tagline: "Run tournaments, look up rulings, keep score.",
    glowColor: getDomainColor("fury"),
    icon: TrophyIcon,
    features: [
      { hash: "tournaments", label: "Tournaments", icon: TrophyIcon },
      { hash: "rules", label: "Rules", icon: BookOpenIcon },
      { hash: "tracker", label: "Match tracker", icon: SwordsIcon },
    ],
  },
  {
    id: "community",
    number: "04",
    title: "Community",
    tagline: "Trade with your playgroup, track what you lend, and take it all into Discord.",
    glowColor: getDomainColor("calm"),
    icon: UsersIcon,
    features: [
      { hash: "groups", label: "Groups", icon: UsersIcon },
      { hash: "trade-match", label: "How a trade works", icon: ArrowDownUpIcon },
      { hash: "loans", label: "Loans", icon: HandHeartIcon },
      { hash: "share", label: "Share", icon: Share2Icon },
      { hash: "discord", label: "Discord", icon: MessageSquareIcon },
    ],
  },
  {
    id: "create",
    number: "05",
    title: "Create",
    tagline: "Put cards on stream, rank them, or design your own.",
    glowColor: getDomainColor("chaos"),
    icon: SparklesIcon,
    features: [
      { hash: "stage", label: "Stage", icon: MonitorPlayIcon },
      { hash: "tier-lists", label: "Tier lists", icon: ListOrderedIcon },
      { hash: "chat-lookups", label: "Chat lookups", icon: MessageSquareIcon },
      { hash: "designer", label: "Card designer", icon: PaintbrushIcon },
    ],
  },
];
