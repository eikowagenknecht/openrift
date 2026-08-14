import type { LucideIcon } from "lucide-react";
import {
  ListOrderedIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  PackageOpenIcon,
  TvMinimalPlayIcon,
} from "lucide-react";

import type { IconChipTone } from "@/components/ui/icon-chip";

/**
 * One tool on /creators: a tile at the top of the page, and the section it
 * jumps to further down. The two are declared together so a tile can never
 * point at a section that isn't rendered.
 */
export interface CreatorTool {
  /** Anchor id of the tool's section, and the tile's link target. */
  id: string;
  title: string;
  /** One line for the tile. The section below carries the detail. */
  blurb: string;
  icon: LucideIcon;
  tone: IconChipTone;
  /**
   * Feature flag the tool's entry points hang off. Both the tile and the
   * section drop out while it is off, so the page never advertises a route
   * that redirects.
   */
  featureFlag?: string;
}

export const CREATOR_TOOLS: CreatorTool[] = [
  {
    id: "chat-command",
    title: "Card lookups in chat",
    blurb: "Viewers type !card, your bot answers with the card and a link.",
    icon: MessageSquareIcon,
    tone: "primary",
  },
  {
    id: "tier-lists",
    title: "Tier lists",
    blurb: "Rank a set on a board, then share the link or use the image.",
    icon: ListOrderedIcon,
    tone: "gold",
    featureFlag: "tier-lists",
  },
  {
    id: "presentation",
    title: "Presentation mode",
    blurb: "One card, full screen, no site chrome. Built for window capture.",
    icon: MonitorPlayIcon,
    tone: "sky",
    featureFlag: "overlay",
  },
  {
    id: "overlay",
    title: "Stream overlay",
    blurb: "Push a card onto your stream from your phone, straight into OBS.",
    icon: TvMinimalPlayIcon,
    tone: "violet",
    featureFlag: "overlay",
  },
  {
    id: "segments",
    title: "Segment material",
    blurb: "The pack opener and the card designer, for when you need a bit.",
    icon: PackageOpenIcon,
    tone: "green",
  },
];

/**
 * The tools whose sections are actually on the page.
 *
 * An unflagged tool is always shown. A flagged one needs its flag explicitly
 * on: an unknown key reads as off, so a flag that is renamed or removed hides
 * the tile rather than leaving it pointing at a route that redirects.
 *
 * @param flagEnabled Feature-flag state, keyed by flag.
 * @returns The visible tools, in declaration order.
 */
export function visibleCreatorTools(flagEnabled: Record<string, boolean>): CreatorTool[] {
  return CREATOR_TOOLS.filter(
    (tool) => tool.featureFlag === undefined || flagEnabled[tool.featureFlag] === true,
  );
}
