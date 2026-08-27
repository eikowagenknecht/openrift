import { Link } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BookTextIcon,
  CameraIcon,
  GavelIcon,
  GiftIcon,
  HandHeartIcon,
  LayersIcon,
  LibraryIcon,
  ListOrderedIcon,
  MonitorPlayIcon,
  PackageIcon,
  PackagePlusIcon,
  PaletteIcon,
  PencilLineIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Nav entries that require an account. Signed out, these still show in the nav
// (with a lock glyph) so a new visitor can see what an account unlocks; clicking
// one opens SignInRequiredDialog instead of navigating. Copy mirrors the README.
export type LockedFeatureKey =
  | "collections"
  | "scan"
  | "groups"
  | "loans"
  | "tournaments"
  | "tierLists"
  | "contribute";

const LOCKED_FEATURES: Record<
  LockedFeatureKey,
  { title: string; description: string; to: string; icon: typeof LibraryIcon }
> = {
  collections: {
    title: "Collection",
    description:
      "Track every card you own, down to the printing, across as many collections as you like.",
    to: "/collections",
    icon: LibraryIcon,
  },
  scan: {
    title: "Card scanner",
    description:
      "Hold your cards in front of the camera to add them to a collection, recognised on your device so no pictures are uploaded.",
    to: "/scan",
    icon: CameraIcon,
  },
  groups: {
    title: "Groups",
    description:
      "Form a private group with friends or your local store, with shared collections and trade matching that shows who has the cards you want.",
    to: "/groups",
    icon: UsersIcon,
  },
  loans: {
    title: "Lending",
    description:
      "Keep track of cards you lend to friends: who has them, and what you're borrowing back.",
    to: "/loans",
    icon: HandHeartIcon,
  },
  tournaments: {
    title: "Tournaments",
    description: "Run tournaments with pods, deck check, and judges all under one event.",
    to: "/tournaments",
    icon: TrophyIcon,
  },
  tierLists: {
    title: "Tier lists",
    description: "Rank a set on a drag-and-drop board, then share it as a link or an image.",
    to: "/tier-lists",
    icon: ListOrderedIcon,
  },
  contribute: {
    title: "Contribute",
    description: "Submit missing cards, corrections, and images to the catalogue for review.",
    to: "/contribute",
    icon: PencilLineIcon,
  },
};

// Attention counts referenced by nav items via their `badge` key.
export interface NavBadgeCounts {
  groups: number;
  loans: number;
}

// Single source of truth for both navs. PRIMARY_NAV_ITEMS renders as the
// desktop top-level links and the first block of the mobile sheet;
// MORE_NAV_SECTIONS renders inside the desktop "More" panel and as titled
// groups in the mobile sheet.
export interface NavItemConfig {
  label: string;
  to: string;
  icon: typeof LayersIcon;
  /** Second line of the item's row in the desktop "More" panel. */
  description?: string;
  /** Keep the current search params on navigation (the /cards filters). */
  keepSearch?: boolean;
  /** Needs an account: signed out, the entry renders locked and opens SignInRequiredDialog. */
  lockedKey?: LockedFeatureKey;
  badge?: keyof NavBadgeCounts;
  /** Only rendered while this feature flag is on. */
  flag?: "glossary" | "meta";
  /** Restricts the entry to one nav: the mobile sheet, or the desktop nav. */
  platform?: "mobile" | "desktop";
}

export interface NavSectionConfig {
  label: string;
  items: NavItemConfig[];
}

export const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
  { label: "Cards", to: "/cards", icon: LayersIcon, keepSearch: true },
  { label: "Collection", to: "/collections", icon: LibraryIcon, lockedKey: "collections" },
  { label: "Scan", to: "/scan", icon: CameraIcon, lockedKey: "scan", platform: "mobile" },
  // Decks are available logged out (ADR-035: build local decks without an
  // account), so this entry is a plain link for everyone.
  { label: "Decks", to: "/decks", icon: BookOpenIcon },
  // Only in the primary block, not also under Explore: the mobile sheet renders
  // both lists, so an entry in each would show up twice there.
  { label: "Meta", to: "/meta", icon: TrendingUpIcon, flag: "meta" },
  { label: "Groups", to: "/groups", icon: UsersIcon, lockedKey: "groups", badge: "groups" },
];

export const MORE_NAV_SECTIONS: NavSectionConfig[] = [
  {
    label: "Play",
    items: [
      {
        label: "Rules",
        to: "/rules",
        icon: GavelIcon,
        description: "Core and tournament rules",
      },
      {
        label: "Glossary",
        to: "/glossary",
        icon: BookTextIcon,
        flag: "glossary",
        description: "Symbols, keywords, and shorthand",
      },
      {
        label: "Match tracker",
        to: "/match-tracker",
        icon: SwordsIcon,
        description: "Points and XP for 2–4 players during a game",
      },
    ],
  },
  {
    label: "Organize",
    items: [
      {
        label: "Scan",
        to: "/scan",
        icon: CameraIcon,
        lockedKey: "scan",
        platform: "desktop",
        description: "Add cards to a collection with your camera",
      },
      {
        label: "Tournaments",
        to: "/tournaments",
        icon: TrophyIcon,
        lockedKey: "tournaments",
        description: "Run pods, deck check, and judges under one event",
      },
      {
        label: "Lending",
        to: "/loans",
        icon: HandHeartIcon,
        lockedKey: "loans",
        badge: "loans",
        description: "Cards lent to friends and cards you're borrowing",
      },
    ],
  },
  {
    label: "Create",
    items: [
      {
        label: "Stage",
        to: "/stage",
        icon: MonitorPlayIcon,
        platform: "desktop",
        description: "A full-screen card show, or an overlay for OBS",
      },
      {
        label: "Tier lists",
        to: "/tier-lists",
        icon: ListOrderedIcon,
        lockedKey: "tierLists",
        platform: "desktop",
        description: "Rank a set on a board and share it",
      },
    ],
  },
  {
    label: "Explore",
    items: [
      {
        label: "Promos",
        to: "/promos",
        icon: GiftIcon,
        description: "Alternate printings from events and giveaways",
      },
      {
        label: "Products",
        to: "/products",
        icon: PackageIcon,
        description: "Full card lists for official products",
      },
      {
        label: "Pack opener",
        to: "/pack-opener",
        icon: PackagePlusIcon,
        description: "Simulate opening boosters with real pull rates",
      },
      {
        label: "Card designer",
        to: "/card-designer",
        icon: PaletteIcon,
        description: "Make a custom card with your own background image",
      },
    ],
  },
];

/** The flags every flag-gated nav entry is checked against. */
export type NavFlags = Record<NonNullable<NavItemConfig["flag"]>, boolean>;

/**
 * Whether a nav item renders in the current menu.
 * @returns True when the item's feature flag and platform constraints allow it.
 */
export function navItemVisible(
  item: NavItemConfig,
  opts: { flags: NavFlags; mobile: boolean },
): boolean {
  if (item.flag !== undefined && !opts.flags[item.flag]) {
    return false;
  }
  if (item.platform === "mobile" && !opts.mobile) {
    return false;
  }
  if (item.platform === "desktop" && opts.mobile) {
    return false;
  }
  return true;
}

/**
 * The More sections paired with the items visible in the current menu.
 * @returns Sections that still have at least one item, so an all-desktop
 * section (Create) leaves no empty heading behind in the mobile sheet.
 */
export function visibleMoreSections(opts: {
  flags: NavFlags;
  mobile: boolean;
}): { label: string; items: NavItemConfig[] }[] {
  const sections = MORE_NAV_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => navItemVisible(item, opts)),
  }));
  return sections.filter((section) => section.items.length > 0);
}

/**
 * Screen-reader label for a nav attention badge.
 * @returns The aria-label matching the badge's meaning.
 */
export function badgeAriaLabel(badge: keyof NavBadgeCounts, count: number): string {
  return badge === "loans"
    ? `${count} loans need your confirmation`
    : `${count} items need your attention`;
}

export function SignInRequiredDialog({
  featureKey,
  onOpenChange,
}: {
  featureKey: LockedFeatureKey | null;
  onOpenChange: (open: boolean) => void;
}) {
  const feature = featureKey ? LOCKED_FEATURES[featureKey] : null;
  return (
    <Dialog open={Boolean(feature)} onOpenChange={onOpenChange}>
      {feature && (
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <feature.icon className="text-primary size-5" />
              <DialogTitle>{feature.title}</DialogTitle>
            </div>
            <DialogDescription>{feature.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Link
              to="/login"
              search={{ redirect: feature.to, email: undefined }}
              className={buttonVariants({ variant: "ghost" })}
              onClick={() => onOpenChange(false)}
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              search={{ redirect: feature.to, email: undefined }}
              className={buttonVariants({ variant: "default" })}
              onClick={() => onOpenChange(false)}
            >
              Sign up
            </Link>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
