import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useMatch, useRouter } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BookTextIcon,
  CameraIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  GavelIcon,
  HandHeartIcon,
  GiftIcon,
  EllipsisVerticalIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  ListOrderedIcon,
  LockIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  MonitorPlayIcon,
  MoonIcon,
  PackageIcon,
  PackagePlusIcon,
  PaletteIcon,
  PencilLineIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  SwordsIcon,
  TrendingUpIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { Fragment, useState } from "react";
import { siDiscord, siGithub } from "simple-icons";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import { useAdminAccess } from "@/hooks/use-admin";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import {
  useFriendGroupPendingInvitesCount,
  useFriendGroupPendingRequestsCount,
} from "@/hooks/use-friend-groups";
import { useLoanActionCounts } from "@/hooks/use-loans";
import { signOut } from "@/lib/auth-client";
import { sessionQueryOptions, useSession } from "@/lib/auth-session";
import { useGravatarHash } from "@/lib/gravatar";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
import { useDisplayStore } from "@/stores/display-store";
import { usePaletteStore } from "@/stores/palette-store";
import { useThemeStore } from "@/stores/theme-store";

function LogoLink({ className }: { className?: string }) {
  const isHome = useMatch({ from: "/_app/cards", shouldThrow: false });

  return (
    <Link
      to="/cards"
      className={cn("flex items-center gap-2", className)}
      onClick={(e) => {
        if (isHome) {
          e.preventDefault();
          globalThis.scrollTo({ top: 0, behavior: "smooth" });
        }
      }}
    >
      <img src="/logo-color.svg" alt="OpenRift" className="size-8" />
      <span className="font-heading text-xl font-bold">OpenRift</span>
    </Link>
  );
}

function MenuButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Open menu"
      className={className}
      onClick={onClick}
    >
      <MenuIcon className="size-5" />
    </Button>
  );
}

// Nav entries that require an account. Signed out, these still show in the nav
// (with a lock glyph) so a new visitor can see what an account unlocks; clicking
// one opens SignInRequiredDialog instead of navigating. Copy mirrors the README.
type LockedFeatureKey =
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
interface NavBadgeCounts {
  groups: number;
  loans: number;
}

// Single source of truth for both navs. PRIMARY_NAV_ITEMS renders as the
// desktop top-level links and the first block of the mobile sheet;
// MORE_NAV_SECTIONS renders inside the desktop "More" panel and as titled
// groups in the mobile sheet.
interface NavItemConfig {
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

interface NavSectionConfig {
  label: string;
  items: NavItemConfig[];
}

const PRIMARY_NAV_ITEMS: NavItemConfig[] = [
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

const MORE_NAV_SECTIONS: NavSectionConfig[] = [
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
type NavFlags = Record<NonNullable<NavItemConfig["flag"]>, boolean>;

/**
 * Whether a nav item renders in the current menu.
 * @returns True when the item's feature flag and platform constraints allow it.
 */
function navItemVisible(item: NavItemConfig, opts: { flags: NavFlags; mobile: boolean }): boolean {
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
function badgeAriaLabel(badge: keyof NavBadgeCounts, count: number): string {
  return badge === "loans"
    ? `${count} loans need your confirmation`
    : `${count} items need your attention`;
}

function SignInRequiredDialog({
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

// The pill background is reserved for hover/focus; the active route is marked
// by text emphasis only. Otherwise an active item next to a hovered one renders
// as two same-color pills fused at their rounded corners.
const DESKTOP_NAV_ITEM_CLASS = cn(
  navigationMenuTriggerStyle(),
  "text-muted-foreground hover:text-foreground focus:text-foreground data-[status=active]:text-foreground data-[status=active]:font-semibold",
);

function DesktopPrimaryItem({
  item,
  isLoggedIn,
  badges,
  onLockedClick,
}: {
  item: NavItemConfig;
  isLoggedIn: boolean;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  const lockedKey = item.lockedKey;
  if (lockedKey && !isLoggedIn) {
    return (
      <NavigationMenuLink
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
        render={<button type="button" onClick={() => onLockedClick(lockedKey)} />}
        className={cn(DESKTOP_NAV_ITEM_CLASS, "gap-1.5")}
      >
        {item.label}
        <LockIcon className="text-muted-foreground size-3.5" />
      </NavigationMenuLink>
    );
  }
  const badgeCount = item.badge ? badges[item.badge] : 0;
  return (
    <NavigationMenuLink
      render={<Link to={item.to} search={item.keepSearch ? (prev) => prev : undefined} />}
      className={DESKTOP_NAV_ITEM_CLASS}
    >
      {item.label}
      {item.badge && badgeCount > 0 && (
        <Badge
          variant="count"
          aria-label={badgeAriaLabel(item.badge, badgeCount)}
          className="ml-1.5"
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </Badge>
      )}
    </NavigationMenuLink>
  );
}

function DesktopMoreItem({
  item,
  isLoggedIn,
  badges,
  onLockedClick,
}: {
  item: NavItemConfig;
  isLoggedIn: boolean;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  const lockedKey = item.lockedKey;
  const badgeCount = item.badge ? badges[item.badge] : 0;
  const content = (
    <>
      <item.icon />
      <div>
        <div className="font-medium">
          {item.label}
          {item.badge && badgeCount > 0 && (
            <Badge
              variant="count"
              aria-label={badgeAriaLabel(item.badge, badgeCount)}
              className="ml-1.5"
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground text-xs">{item.description}</div>
      </div>
    </>
  );
  if (lockedKey && !isLoggedIn) {
    return (
      <NavigationMenuLink
        closeOnClick
        // A native <button> shrinks to its content and centers its text; force
        // it to fill and left-align so it matches the <Link>-rendered rows.
        className="w-full text-left"
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
        render={<button type="button" onClick={() => onLockedClick(lockedKey)} />}
      >
        {content}
        <LockIcon className="text-muted-foreground ml-auto size-3.5 self-center" />
      </NavigationMenuLink>
    );
  }
  return (
    <NavigationMenuLink closeOnClick render={<Link to={item.to} />}>
      {content}
    </NavigationMenuLink>
  );
}

function DesktopNav({
  isLoggedIn,
  flags,
  badges,
  onLockedClick,
}: {
  isLoggedIn: boolean;
  flags: NavFlags;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  return (
    <NavigationMenu>
      <NavigationMenuList className="gap-1">
        {PRIMARY_NAV_ITEMS.filter((item) => navItemVisible(item, { flags, mobile: false })).map(
          (item) => (
            <NavigationMenuItem key={item.to}>
              <DesktopPrimaryItem
                item={item}
                isLoggedIn={isLoggedIn}
                badges={badges}
                onLockedClick={onLockedClick}
              />
            </NavigationMenuItem>
          ),
        )}
        <NavigationMenuItem>
          <NavigationMenuTrigger className="text-muted-foreground hover:text-foreground focus:text-foreground data-popup-open:text-foreground">
            More
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            {/* CSS columns pack the sections side by side; break-inside-avoid
                keeps each section whole so a group never splits mid-column. */}
            <div className="w-[34rem] columns-2 gap-2 p-2">
              {visibleMoreSections({ flags, mobile: false }).map((section) => (
                <section key={section.label} className="mb-3 break-inside-avoid last:mb-0">
                  <div className="text-muted-foreground px-2 pb-1 text-xs font-semibold tracking-wide uppercase">
                    {section.label}
                  </div>
                  <ul className="grid gap-1">
                    {section.items.map((item) => (
                      <li key={item.to}>
                        <DesktopMoreItem
                          item={item}
                          isLoggedIn={isLoggedIn}
                          badges={badges}
                          onLockedClick={onLockedClick}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function UserMenuTrigger({
  user,
}: {
  user: { name: string; email: string; image?: string | null } | undefined;
}) {
  const gravatarHash = useGravatarHash(user?.email);
  if (user) {
    return (
      <UserAvatar
        image={user.image}
        name={user.name}
        email={user.email}
        gravatarHash={gravatarHash}
        size="sm"
      />
    );
  }
  return <EllipsisVerticalIcon className="size-5" />;
}

function UserMenuItems({ isLoggedIn }: { isLoggedIn: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const darkMode = theme === "dark";
  const { data: adminAccess } = useAdminAccess();
  const hasAdminAccess =
    adminAccess !== undefined && (adminAccess.isAdmin || adminAccess.sections.length > 0);
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    useDisplayStore.getState().reset();
    useThemeStore.getState().reset();
    usePaletteStore.getState().reset();
    useAddModeStore.getState().reset();
    useDeckBuilderUiStore.getState().reset();
    // Navigate first so authenticated routes start unmounting, then
    // refetch the session (the cookie is gone, the server returns null).
    // Synchronously setting the session to null would re-render the
    // still-mounted CollectionGrid / CollectionSidebar / deck builder
    // before React commits the unmount — useRequiredUserId throws and
    // the route crashes. The refetch is async; its network round-trip
    // gives React time to commit, so observers only see the new state
    // once those components are gone.
    await router.navigate({ to: "/cards", search: {} });
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  };

  return (
    <DropdownMenuContent align="end">
      {isLoggedIn && (
        <DropdownMenuItem render={<Link to="/profile" />}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
      )}
      {isLoggedIn && hasAdminAccess && (
        <DropdownMenuItem render={<Link to="/admin" />}>
          <ShieldIcon className="size-4" />
          Admin
        </DropdownMenuItem>
      )}
      {isLoggedIn && <DropdownMenuSeparator />}
      {!isLoggedIn && (
        <DropdownMenuItem onClick={toggleTheme}>
          {darkMode ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
          {darkMode ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem render={<Link to="/help" />}>
        <CircleHelpIcon className="size-4" />
        Help
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link to="/changelog" />}>
        <SparklesIcon className="size-4" />
        What&apos;s new
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link to="/support" />}>
        <HeartIcon className="size-4" />
        Support us
      </DropdownMenuItem>
      {isLoggedIn && <DropdownMenuSeparator />}
      {isLoggedIn && (
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

// Signing in from one of these would either bounce through an auth page or
// land back on the marketing page, so they carry no redirect and fall through
// to the post-sign-in default.
const NO_SIGN_IN_REDIRECT: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/verify-email",
]);

/** Picks the `redirect` the header's Sign in button carries from the current location.
 * @returns The href to return to after signing in, or `undefined` to use the default.
 */
export function signInRedirectFor(location: {
  pathname: string;
  href: string;
}): string | undefined {
  return NO_SIGN_IN_REDIRECT.has(location.pathname) ? undefined : location.href;
}

function UserMenu({
  session,
  isPending,
}: {
  session: ReturnType<typeof useSession>["data"];
  isPending: boolean;
}) {
  const isLoggedIn = Boolean(session?.user);
  const signInRedirect = useLocation({ select: signInRedirectFor });

  if (isPending) {
    return <div className="size-8" />;
  }

  const user = session?.user;

  return (
    <div className="flex items-center gap-2">
      {!user && (
        <Link
          to="/login"
          search={{ redirect: signInRedirect, email: undefined }}
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Sign in
        </Link>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}>
          <UserMenuTrigger user={user} />
        </DropdownMenuTrigger>
        <UserMenuItems isLoggedIn={isLoggedIn} />
      </DropdownMenu>
    </div>
  );
}

// Same active-state treatment as DESKTOP_NAV_ITEM_CLASS: background for
// hover only, text emphasis for the active route.
const MOBILE_NAV_ITEM_CLASS =
  "text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-lg px-3 py-3.5 text-base data-[status=active]:font-semibold data-[status=active]:text-foreground";

function MobileNavItem({
  item,
  compact,
  isLoggedIn,
  badges,
  onLockedClick,
}: {
  item: NavItemConfig;
  /** Tighter rows for the titled sections; the primary block keeps the roomy padding. */
  compact?: boolean;
  isLoggedIn: boolean;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  const lockedKey = item.lockedKey;
  const rowClass = cn(MOBILE_NAV_ITEM_CLASS, compact && "py-2.5");
  const icon = <item.icon className="text-muted-foreground size-5" />;
  // Signed out, a locked entry closes the sheet and opens the sign-in dialog
  // instead of navigating.
  if (lockedKey && !isLoggedIn) {
    return (
      <SheetClose
        // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; SheetClose/MOBILE_NAV_ITEM_CLASS owns all styling and provides the label as children
        render={<button type="button" onClick={() => onLockedClick(lockedKey)} />}
        className={rowClass}
      >
        {icon}
        {item.label}
        <LockIcon className="text-muted-foreground ml-auto size-4" />
      </SheetClose>
    );
  }
  const badgeCount = item.badge ? badges[item.badge] : 0;
  return (
    <SheetClose
      nativeButton={false}
      render={<Link to={item.to} search={item.keepSearch ? (prev) => prev : undefined} />}
      className={rowClass}
    >
      {icon}
      {item.label}
      {item.badge && badgeCount > 0 && (
        <Badge
          variant="count"
          aria-label={badgeAriaLabel(item.badge, badgeCount)}
          className="ml-auto"
        >
          {badgeCount > 9 ? "9+" : badgeCount}
        </Badge>
      )}
    </SheetClose>
  );
}

function MobileNav({
  open,
  onOpenChange,
  isLoggedIn,
  flags,
  badges,
  onLockedClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoggedIn: boolean;
  flags: NavFlags;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>
            <Link
              to="/cards"
              className="font-heading flex items-center gap-2 font-bold"
              onClick={() => onOpenChange(false)}
            >
              <img src="/logo-color.svg" alt="OpenRift" className="size-6" />
              OpenRift
            </Link>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-2">
          {PRIMARY_NAV_ITEMS.filter((item) => navItemVisible(item, { flags, mobile: true })).map(
            (item) => (
              <MobileNavItem
                key={item.to}
                item={item}
                isLoggedIn={isLoggedIn}
                badges={badges}
                onLockedClick={onLockedClick}
              />
            ),
          )}
          {visibleMoreSections({ flags, mobile: true }).map((section) => (
            <Fragment key={section.label}>
              <div className="text-muted-foreground mt-3 px-3 pb-1 font-semibold tracking-wide uppercase">
                {section.label}
              </div>
              {section.items.map((item) => (
                <MobileNavItem
                  key={item.to}
                  item={item}
                  compact
                  isLoggedIn={isLoggedIn}
                  badges={badges}
                  onLockedClick={onLockedClick}
                />
              ))}
            </Fragment>
          ))}
        </nav>
        <SheetFooter className="border-t px-4 pt-4">
          <SheetClose
            nativeButton={false}
            render={<Link to="/help" />}
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm"
          >
            <CircleHelpIcon className="size-4" />
            Help
          </SheetClose>
          <SheetClose
            nativeButton={false}
            render={<Link to="/changelog" />}
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm"
          >
            <SparklesIcon className="size-4" />
            What&apos;s new
          </SheetClose>
          <a
            href={SOCIAL_LINKS.discordInvite}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-sm"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
              <path d={siDiscord.path} fill="currentColor" />
            </svg>
            Join our Discord
          </a>
          <p className="text-muted-foreground text-xs">Built with Fury. Maintained with Calm.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FeedbackPopover({
  isLoggedIn,
  onLockedClick,
}: {
  isLoggedIn: boolean;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="sm" />} className="gap-1.5">
        <MessageSquareIcon className="size-4" />
        <span className="sr-only md:not-sr-only">Feedback</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs">
          Bug report, feature idea, or just want to chat?
        </p>
        <PopoverClose
          nativeButton={false}
          render={
            // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- content is provided as children of PopoverClose
            <a href={SOCIAL_LINKS.discordInvite} target="_blank" rel="noreferrer" />
          }
          className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-2 text-sm"
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
            <path d={siDiscord.path} fill="currentColor" />
          </svg>
          <div>
            <div className="font-medium">Discord</div>
            <div className="text-muted-foreground text-xs">Chat, report bugs, or share ideas</div>
          </div>
          <ExternalLinkIcon className="text-muted-foreground ml-auto size-3.5" />
        </PopoverClose>
        <PopoverClose
          nativeButton={false}
          render={
            // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- content is provided as children of PopoverClose
            <a href={SOCIAL_LINKS.githubNewIssue} target="_blank" rel="noreferrer" />
          }
          className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-2 text-sm"
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
            <path d={siGithub.path} fill="currentColor" />
          </svg>
          <div>
            <div className="font-medium">GitHub Issues</div>
            <div className="text-muted-foreground text-xs">
              We&apos;ll get back to you (we actually will)
            </div>
          </div>
          <ExternalLinkIcon className="text-muted-foreground ml-auto size-3.5" />
        </PopoverClose>
        {isLoggedIn ? (
          <PopoverClose
            nativeButton={false}
            render={<Link to="/contribute" />}
            className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-2 text-sm"
          >
            <PencilLineIcon className="size-4 shrink-0" />
            <div>
              <div className="font-medium">Contribute card data</div>
              <div className="text-muted-foreground text-xs">Add a missing card or fix a typo</div>
            </div>
          </PopoverClose>
        ) : (
          <PopoverClose
            // A native <button> shrinks to its content and centers its text; force
            // it to fill and left-align so it matches the <Link>-rendered rows.
            className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm"
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; PopoverClose owns all styling and provides the label as children
            render={<button type="button" onClick={() => onLockedClick("contribute")} />}
          >
            <PencilLineIcon className="size-4 shrink-0" />
            <div>
              <div className="font-medium">Contribute card data</div>
              <div className="text-muted-foreground text-xs">Add a missing card or fix a typo</div>
            </div>
            <LockIcon className="text-muted-foreground ml-auto size-3.5 self-center" />
          </PopoverClose>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function Header() {
  const { data: session, isPending } = useSession();
  const glossaryEnabled = useFeatureEnabled("glossary");
  const metaEnabled = useFeatureEnabled("meta");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<LockedFeatureKey | null>(null);
  const navFlags: NavFlags = { glossary: glossaryEnabled, meta: metaEnabled };
  const isLoggedIn = Boolean(session?.user);
  const { data: pendingInvitesData } = useFriendGroupPendingInvitesCount({ enabled: isLoggedIn });
  const { data: pendingRequestsData } = useFriendGroupPendingRequestsCount({ enabled: isLoggedIn });
  const { data: tradeActionCounts } = useTradeActionCounts();
  // Loans awaiting the viewer's acknowledgment as borrower (ADR-039), shown on
  // the Lending entries in the More menus.
  const { data: loanActionCounts } = useLoanActionCounts();
  const loansBadge = loanActionCounts?.total ?? 0;
  // One "Groups need your attention" badge: pending invites to you + join
  // requests awaiting your approval + trades awaiting action.
  const groupsBadge =
    (pendingInvitesData?.count ?? 0) +
    (pendingRequestsData?.count ?? 0) +
    (tradeActionCounts?.total ?? 0);

  return (
    <header
      data-app-header
      className={cn(
        STICKY_SURFACE,
        "border-border-accent sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)]",
      )}
    >
      <div
        className={cn(
          CONTAINER_WIDTH,
          "px-safe grid h-14 grid-cols-[1fr_auto_1fr] items-center md:grid-cols-[1fr_auto]",
        )}
      >
        {/* Left: Hamburger on mobile. -ml-1 pulls the 20px glyph out of the
            28px icon button's padding so it lands on the px-safe gutter,
            flush with page content below (cards, titles). */}
        <div className="-ml-1 flex items-center gap-1 md:hidden">
          <MenuButton onClick={() => setMobileMenuOpen(true)} />
        </div>

        {/* Left: logo + expanded menu on desktop */}
        <div className="hidden gap-4 md:flex">
          <LogoLink />
          <DesktopNav
            isLoggedIn={isLoggedIn}
            flags={navFlags}
            badges={{ groups: groupsBadge, loans: loansBadge }}
            onLockedClick={setLockedFeature}
          />
        </div>

        {/* Center: Logo on mobile */}
        <LogoLink className="md:hidden" />

        {/* Right: Feedback + Support + User menu. -mr-0.5 pulls the trailing
            avatar (24px in a 28px icon button) out to the px-safe gutter so the
            header's right edge aligns with flush page content. */}
        <div className="-mr-0.5 flex items-center gap-1 justify-self-end">
          <FeedbackPopover isLoggedIn={isLoggedIn} onLockedClick={setLockedFeature} />
          <Link
            to="/support"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden md:inline-flex",
            )}
          >
            <HeartIcon className="size-4" />
            Support
          </Link>
          <UserMenu session={session} isPending={isPending} />
        </div>
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        isLoggedIn={isLoggedIn}
        flags={navFlags}
        badges={{ groups: groupsBadge, loans: loansBadge }}
        onLockedClick={setLockedFeature}
      />

      <SignInRequiredDialog
        featureKey={lockedFeature}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) {
            setLockedFeature(null);
          }
        }}
      />
    </header>
  );
}
