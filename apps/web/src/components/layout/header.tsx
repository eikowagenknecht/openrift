import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useMatch, useRouter } from "@tanstack/react-router";
import {
  CircleHelpIcon,
  ExternalLinkIcon,
  EllipsisVerticalIcon,
  HeartIcon,
  LockIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  MoonIcon,
  PencilLineIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";
import { siDiscord, siGithub } from "simple-icons";
import { toast } from "sonner";

import type { NavFlags } from "@/components/layout/nav-items";
import {
  badgeAriaLabel,
  navItemVisible,
  PRIMARY_NAV_ITEMS,
  SignInRequiredDialog,
  visibleMoreSections,
} from "@/components/layout/nav-items";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Kbd } from "@/components/ui/kbd";
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
import { signOut } from "@/features/account/lib/auth-client";
import { useAdminAccess } from "@/features/admin/hooks/use-admin";
import { useAddModeStore } from "@/features/collections/stores/add-mode-store";
import { usePaletteStore } from "@/features/collections/stores/palette-store";
import { useDeckBuilderUiStore } from "@/features/decks/stores/deck-builder-ui-store";
import { useTradeActionCounts } from "@/features/groups/hooks/use-card-trades";
import { useFriendGroupPendingRequestsCount } from "@/features/groups/hooks/use-friend-groups";
import { useLoanActionCounts } from "@/features/groups/hooks/use-loans";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { sessionQueryOptions, useSession } from "@/lib/auth-session";
import { useGravatarHash } from "@/lib/gravatar";
import type { LockedFeatureKey, NavBadgeCounts, NavItemConfig } from "@/lib/nav-items";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { STICKY_SURFACE } from "@/lib/sticky-surface";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import { useCommandPaletteStore } from "@/stores/command-palette-store";
import { useDisplayStore } from "@/stores/display-store";
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

// Pill background is hover/focus-only, active is text-only, or an active item
// next to a hovered one renders as two same-color pills fused at their corners.
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
                  <div className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
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
    try {
      await signOut();
      useDisplayStore.getState().reset();
      useThemeStore.getState().reset();
      usePaletteStore.getState().reset();
      useAddModeStore.getState().reset();
      useDeckBuilderUiStore.getState().reset();
      // Navigate before invalidating the session query: a still-mounted
      // authenticated component would see the null session and crash on useRequiredUserId.
      await router.navigate({ to: "/cards", search: {} });
      void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
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
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <LogOutIcon className="size-4" />
          Sign out
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  );
}

// Signing in from one of these bounces through an auth page or the marketing
// page, so they carry no redirect and fall through to the post-sign-in default.
const NO_SIGN_IN_REDIRECT: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/verify-email",
]);

/** Picks the `redirect` the header's Sign in button carries from the current location. */
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
  compact?: boolean;
  isLoggedIn: boolean;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  const lockedKey = item.lockedKey;
  const rowClass = cn(MOBILE_NAV_ITEM_CLASS, compact && "py-2.5");
  const icon = <item.icon className="text-muted-foreground size-5" />;
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

function MobileNavSection({
  section,
  isLoggedIn,
  badges,
  onLockedClick,
}: {
  section: { label: string; items: NavItemConfig[] };
  isLoggedIn: boolean;
  badges: NavBadgeCounts;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hiddenBadgeCount = expanded
    ? 0
    : section.items.reduce((sum, item) => sum + (item.badge ? badges[item.badge] : 0), 0);

  return (
    <div className="mt-2 flex flex-col gap-1">
      <ExpandToggle
        expanded={expanded}
        chevronPosition="end"
        chevronClassName="size-3.5"
        onClick={() => setExpanded((prev) => !prev)}
        className="text-muted-foreground hover:text-foreground w-full justify-between rounded-lg px-3 py-2 text-xs font-medium tracking-wide uppercase"
      >
        <span className="flex items-center gap-2">
          {section.label}
          {hiddenBadgeCount > 0 && (
            <Badge variant="count" aria-label={`${section.label} needs your attention`}>
              {hiddenBadgeCount > 9 ? "9+" : hiddenBadgeCount}
            </Badge>
          )}
        </span>
      </ExpandToggle>
      {expanded &&
        section.items.map((item) => (
          <MobileNavItem
            key={item.to}
            item={item}
            compact
            isLoggedIn={isLoggedIn}
            badges={badges}
            onLockedClick={onLockedClick}
          />
        ))}
    </div>
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
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2">
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
            <MobileNavSection
              key={section.label}
              section={section}
              isLoggedIn={isLoggedIn}
              badges={badges}
              onLockedClick={onLockedClick}
            />
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

// Do not swap in a platform-detected glyph (Cmd/Ctrl): navigator-based
// detection differs between server and client and breaks SSR hydration.
function HeaderSearchButton() {
  const openPalette = useCommandPaletteStore((state) => state.openPalette);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Search"
      onClick={openPalette}
      className="text-muted-foreground gap-1.5"
    >
      <SearchIcon className="size-4" />
      <span className="hidden lg:inline">Search</span>
      <Kbd className="hidden lg:inline-flex">Ctrl K</Kbd>
    </Button>
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
  const { data: pendingRequestsData } = useFriendGroupPendingRequestsCount({ enabled: isLoggedIn });
  const { data: tradeActionCounts } = useTradeActionCounts();
  const { data: loanActionCounts } = useLoanActionCounts();
  const loansBadge = loanActionCounts?.total ?? 0;
  const groupsBadge = (pendingRequestsData?.count ?? 0) + (tradeActionCounts?.total ?? 0);

  return (
    <header
      data-app-header
      className={cn(
        STICKY_SURFACE,
        "border-border-accent sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)]",
      )}
    >
      <div className={cn(CONTAINER_WIDTH, "px-safe grid h-14 grid-cols-[1fr_auto] items-center")}>
        {/* Left: Hamburger and logo on mobile. -ml-1 pulls the 20px glyph out
            of the 28px icon button's padding so it lands on the px-safe gutter,
            flush with page content below (cards, titles). */}
        <div className="-ml-1 flex items-center gap-1 md:hidden">
          <MenuButton onClick={() => setMobileMenuOpen(true)} />
          <LogoLink />
        </div>

        <div className="hidden gap-4 md:flex">
          <LogoLink />
          <DesktopNav
            isLoggedIn={isLoggedIn}
            flags={navFlags}
            badges={{ groups: groupsBadge, loans: loansBadge }}
            onLockedClick={setLockedFeature}
          />
        </div>

        {/* Right: Search + Feedback + Support + User menu. -mr-0.5 pulls the
            trailing avatar (24px in a 28px icon button) out to the px-safe
            gutter so the header's right edge aligns with flush page content. */}
        <div className="-mr-0.5 flex items-center gap-1 justify-self-end">
          <HeaderSearchButton />
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
