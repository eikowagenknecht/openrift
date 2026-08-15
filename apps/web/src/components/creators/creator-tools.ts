import type { LucideIcon } from "lucide-react";
import { ListOrderedIcon, MessageSquareIcon, MonitorPlayIcon } from "lucide-react";

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
   * The tool's own page, when it has one, so the tile can offer a direct Open
   * next to the jump into the setup section. The chat command has no page of
   * its own — the snippet in its section is the whole tool — so it has no
   * target here.
   */
  to?: "/stage" | "/tier-lists";
}

export const CREATOR_TOOLS: CreatorTool[] = [
  {
    id: "stage",
    title: "Stage",
    blurb: "A full-screen card show for recording, or an overlay for OBS.",
    icon: MonitorPlayIcon,
    tone: "sky",
    to: "/stage",
  },
  {
    id: "tier-lists",
    title: "Tier lists",
    blurb: "Rank a set on a board, then share it as a link or an image.",
    icon: ListOrderedIcon,
    tone: "gold",
    to: "/tier-lists",
  },
  {
    id: "chat-command",
    title: "Card lookups in chat",
    blurb: "Viewers type !card and your bot answers with the card and a link.",
    icon: MessageSquareIcon,
    tone: "primary",
  },
];
