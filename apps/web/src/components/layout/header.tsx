import { useQueryClient } from "@tanstack/react-query";
import { Link, useMatch, useRouter } from "@tanstack/react-router";
import {
  BookOpenIcon,
  BookTextIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  GavelIcon,
  HandHeartIcon,
  GiftIcon,
  EllipsisVerticalIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  LockIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  MoonIcon,
  PackageIcon,
  PackagePlusIcon,
  PaletteIcon,
  PencilLineIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  SwordsIcon,
  TrophyIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
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
type LockedFeatureKey = "collections" | "groups" | "loans" | "tournaments" | "contribute";

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
  contribute: {
    title: "Contribute",
    description: "Submit missing cards, corrections, and images to the catalogue for review.",
    to: "/contribute",
    icon: PencilLineIcon,
  },
};

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

function DesktopNav({
  isLoggedIn,
  showGlossary,
  showDecks,
  groupsBadge,
  loansBadge,
  onLockedClick,
}: {
  isLoggedIn: boolean;
  showGlossary: boolean;
  showDecks: boolean;
  groupsBadge: number;
  loansBadge: number;
  onLockedClick: (key: LockedFeatureKey) => void;
}) {
  return (
    <NavigationMenu>
      <NavigationMenuList className="gap-1">
        <NavigationMenuItem>
          <NavigationMenuLink
            render={<Link to="/cards" search={(prev) => prev} />}
            className={DESKTOP_NAV_ITEM_CLASS}
          >
            Cards
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          {isLoggedIn ? (
            <NavigationMenuLink
              render={<Link to="/collections" />}
              className={DESKTOP_NAV_ITEM_CLASS}
            >
              Collection
            </NavigationMenuLink>
          ) : (
            <NavigationMenuLink
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
              render={<button type="button" onClick={() => onLockedClick("collections")} />}
              className={cn(DESKTOP_NAV_ITEM_CLASS, "gap-1.5")}
            >
              Collection
              <LockIcon className="text-muted-foreground size-3.5" />
            </NavigationMenuLink>
          )}
        </NavigationMenuItem>
        {showDecks && (
          <NavigationMenuItem>
            <NavigationMenuLink render={<Link to="/decks" />} className={DESKTOP_NAV_ITEM_CLASS}>
              Decks
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}
        <NavigationMenuItem>
          {isLoggedIn ? (
            <NavigationMenuLink render={<Link to="/groups" />} className={DESKTOP_NAV_ITEM_CLASS}>
              Groups
              {groupsBadge > 0 && (
                <Badge
                  variant="count"
                  aria-label={`${groupsBadge} items need your attention`}
                  className="ml-1.5"
                >
                  {groupsBadge > 9 ? "9+" : groupsBadge}
                </Badge>
              )}
            </NavigationMenuLink>
          ) : (
            <NavigationMenuLink
              // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
              render={<button type="button" onClick={() => onLockedClick("groups")} />}
              className={cn(DESKTOP_NAV_ITEM_CLASS, "gap-1.5")}
            >
              Groups
              <LockIcon className="text-muted-foreground size-3.5" />
            </NavigationMenuLink>
          )}
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="text-muted-foreground hover:text-foreground focus:text-foreground data-popup-open:text-foreground">
            More
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-64 gap-1 p-1">
              <li>
                <NavigationMenuLink closeOnClick render={<Link to="/rules" />}>
                  <GavelIcon />
                  <div>
                    <div className="font-medium">Rules</div>
                    <div className="text-muted-foreground text-xs">Core and tournament rules</div>
                  </div>
                </NavigationMenuLink>
              </li>
              {showGlossary && (
                <li>
                  <NavigationMenuLink closeOnClick render={<Link to="/glossary" />}>
                    <BookTextIcon />
                    <div>
                      <div className="font-medium">Glossary</div>
                      <div className="text-muted-foreground text-xs">
                        Symbols, keywords, and shorthand
                      </div>
                    </div>
                  </NavigationMenuLink>
                </li>
              )}
              <li>
                <NavigationMenuLink closeOnClick render={<Link to="/promos" />}>
                  <GiftIcon />
                  <div>
                    <div className="font-medium">Promos</div>
                    <div className="text-muted-foreground text-xs">
                      Alternate printings from events and giveaways
                    </div>
                  </div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink closeOnClick render={<Link to="/products" />}>
                  <PackageIcon />
                  <div>
                    <div className="font-medium">Products</div>
                    <div className="text-muted-foreground text-xs">
                      Full card lists for official products
                    </div>
                  </div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink closeOnClick render={<Link to="/pack-opener" />}>
                  <PackagePlusIcon />
                  <div>
                    <div className="font-medium">Pack opener</div>
                    <div className="text-muted-foreground text-xs">
                      Simulate opening boosters with real pull rates
                    </div>
                  </div>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink closeOnClick render={<Link to="/card-designer" />}>
                  <PaletteIcon />
                  <div>
                    <div className="font-medium">Card designer</div>
                    <div className="text-muted-foreground text-xs">
                      Make a custom card with your own background image
                    </div>
                  </div>
                </NavigationMenuLink>
              </li>
              <li>
                {isLoggedIn ? (
                  <NavigationMenuLink closeOnClick render={<Link to="/loans" />}>
                    <HandHeartIcon />
                    <div>
                      <div className="font-medium">
                        Lending
                        {loansBadge > 0 && (
                          <Badge
                            variant="count"
                            aria-label={`${loansBadge} loans need your confirmation`}
                            className="ml-1.5"
                          >
                            {loansBadge > 9 ? "9+" : loansBadge}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Cards lent to friends and cards you&apos;re borrowing
                      </div>
                    </div>
                  </NavigationMenuLink>
                ) : (
                  <NavigationMenuLink
                    closeOnClick
                    // A native <button> shrinks to its content and centers its text; force
                    // it to fill and left-align so it matches the <Link>-rendered rows.
                    className="w-full text-left"
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
                    render={<button type="button" onClick={() => onLockedClick("loans")} />}
                  >
                    <HandHeartIcon />
                    <div>
                      <div className="font-medium">Lending</div>
                      <div className="text-muted-foreground text-xs">
                        Cards lent to friends and cards you&apos;re borrowing
                      </div>
                    </div>
                    <LockIcon className="text-muted-foreground ml-auto size-3.5 self-center" />
                  </NavigationMenuLink>
                )}
              </li>
              <li>
                {isLoggedIn ? (
                  <NavigationMenuLink closeOnClick render={<Link to="/tournaments" />}>
                    <TrophyIcon />
                    <div>
                      <div className="font-medium">Tournaments</div>
                      <div className="text-muted-foreground text-xs">
                        Run pods, deck check, and judges under one event
                      </div>
                    </div>
                  </NavigationMenuLink>
                ) : (
                  <NavigationMenuLink
                    closeOnClick
                    // A native <button> shrinks to its content and centers its text; force
                    // it to fill and left-align so it matches the <Link>-rendered rows.
                    className="w-full text-left"
                    // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; NavigationMenuLink owns all styling and provides the label as children
                    render={<button type="button" onClick={() => onLockedClick("tournaments")} />}
                  >
                    <TrophyIcon />
                    <div>
                      <div className="font-medium">Tournaments</div>
                      <div className="text-muted-foreground text-xs">
                        Run pods, deck check, and judges under one event
                      </div>
                    </div>
                    <LockIcon className="text-muted-foreground ml-auto size-3.5 self-center" />
                  </NavigationMenuLink>
                )}
              </li>
              {/* Match tracker is a phone feature — it's in the mobile menu only, not here. */}
            </ul>
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

function UserMenu({
  session,
  isPending,
}: {
  session: ReturnType<typeof useSession>["data"];
  isPending: boolean;
}) {
  const isLoggedIn = Boolean(session?.user);

  if (isPending) {
    return <div className="size-8" />;
  }

  const user = session?.user;

  return (
    <div className="flex items-center gap-2">
      {!user && (
        <Link
          to="/login"
          search={{ redirect: undefined, email: undefined }}
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

function MobileNavLink({
  to,
  search,
  icon,
  children,
  badge,
}: {
  to: string;
  search?: (prev: Record<string, unknown>) => Record<string, unknown>;
  icon: ReactNode;
  children: ReactNode;
  badge?: number;
}) {
  return (
    <SheetClose
      nativeButton={false}
      render={<Link to={to} search={search} />}
      className={MOBILE_NAV_ITEM_CLASS}
    >
      {icon}
      {children}
      {badge !== undefined && badge > 0 && (
        <Badge
          variant="count"
          aria-label={`${badge} items need your attention`}
          className="ml-auto"
        >
          {badge > 9 ? "9+" : badge}
        </Badge>
      )}
    </SheetClose>
  );
}

// Signed-out counterpart to MobileNavLink: closes the sheet and opens the
// sign-in dialog instead of navigating.
function MobileNavLockedItem({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <SheetClose
      // oxlint-disable-next-line jsx-a11y/control-has-associated-label, react/forbid-elements -- bare render slot; SheetClose/MOBILE_NAV_ITEM_CLASS owns all styling and provides the label as children
      render={<button type="button" onClick={onClick} />}
      className={MOBILE_NAV_ITEM_CLASS}
    >
      {icon}
      {children}
      <LockIcon className="text-muted-foreground ml-auto size-4" />
    </SheetClose>
  );
}

function MobileNav({
  open,
  onOpenChange,
  isLoggedIn,
  showGlossary,
  showDecks,
  groupsBadge,
  loansBadge,
  onLockedClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLoggedIn: boolean;
  showGlossary: boolean;
  showDecks: boolean;
  groupsBadge: number;
  loansBadge: number;
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
          <MobileNavLink
            to="/cards"
            search={(prev) => prev}
            icon={<LayersIcon className="text-muted-foreground size-5" />}
          >
            Cards
          </MobileNavLink>
          {isLoggedIn ? (
            <MobileNavLink
              to="/collections"
              icon={<LibraryIcon className="text-muted-foreground size-5" />}
            >
              Collection
            </MobileNavLink>
          ) : (
            <MobileNavLockedItem
              icon={<LibraryIcon className="text-muted-foreground size-5" />}
              onClick={() => onLockedClick("collections")}
            >
              Collection
            </MobileNavLockedItem>
          )}
          {showDecks && (
            <MobileNavLink
              to="/decks"
              icon={<BookOpenIcon className="text-muted-foreground size-5" />}
            >
              Decks
            </MobileNavLink>
          )}
          {isLoggedIn ? (
            <MobileNavLink
              to="/groups"
              icon={<UsersIcon className="text-muted-foreground size-5" />}
              badge={groupsBadge}
            >
              Groups
            </MobileNavLink>
          ) : (
            <MobileNavLockedItem
              icon={<UsersIcon className="text-muted-foreground size-5" />}
              onClick={() => onLockedClick("groups")}
            >
              Groups
            </MobileNavLockedItem>
          )}
          <div className="text-muted-foreground mt-3 px-3 pb-1 font-semibold tracking-wide uppercase">
            More
          </div>
          <MobileNavLink to="/rules" icon={<GavelIcon className="text-muted-foreground size-5" />}>
            Rules
          </MobileNavLink>
          {showGlossary && (
            <MobileNavLink
              to="/glossary"
              icon={<BookTextIcon className="text-muted-foreground size-5" />}
            >
              Glossary
            </MobileNavLink>
          )}
          <MobileNavLink to="/promos" icon={<GiftIcon className="text-muted-foreground size-5" />}>
            Promos
          </MobileNavLink>
          <MobileNavLink
            to="/products"
            icon={<PackageIcon className="text-muted-foreground size-5" />}
          >
            Products
          </MobileNavLink>
          <MobileNavLink
            to="/pack-opener"
            icon={<PackagePlusIcon className="text-muted-foreground size-5" />}
          >
            Pack opener
          </MobileNavLink>
          <MobileNavLink
            to="/card-designer"
            icon={<PaletteIcon className="text-muted-foreground size-5" />}
          >
            Card designer
          </MobileNavLink>
          <MobileNavLink
            to="/match-tracker"
            icon={<SwordsIcon className="text-muted-foreground size-5" />}
          >
            Match tracker
          </MobileNavLink>
          {isLoggedIn ? (
            <MobileNavLink
              to="/loans"
              icon={<HandHeartIcon className="text-muted-foreground size-5" />}
              badge={loansBadge}
            >
              Lending
            </MobileNavLink>
          ) : (
            <MobileNavLockedItem
              icon={<HandHeartIcon className="text-muted-foreground size-5" />}
              onClick={() => onLockedClick("loans")}
            >
              Lending
            </MobileNavLockedItem>
          )}
          {isLoggedIn ? (
            <MobileNavLink
              to="/tournaments"
              icon={<TrophyIcon className="text-muted-foreground size-5" />}
            >
              Tournaments
            </MobileNavLink>
          ) : (
            <MobileNavLockedItem
              icon={<TrophyIcon className="text-muted-foreground size-5" />}
              onClick={() => onLockedClick("tournaments")}
            >
              Tournaments
            </MobileNavLockedItem>
          )}
        </nav>
        <SheetFooter className="border-t px-4 pt-4">
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<LockedFeatureKey | null>(null);
  const showGlossary = glossaryEnabled;
  const isLoggedIn = Boolean(session?.user);
  // Collection, Groups, and Tournaments always show in the nav. Signed out they
  // render as locked entries that open SignInRequiredDialog (via setLockedFeature)
  // instead of navigating. Decks are available logged out (ADR-035: build local
  // decks without an account), so that entry is a plain link for everyone.
  const showDecks = true;
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
      className="bg-background/80 border-border-accent sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)] backdrop-blur-lg"
    >
      <div
        className={`${CONTAINER_WIDTH} px-safe grid h-14 grid-cols-[1fr_auto_1fr] items-center md:grid-cols-[1fr_auto]`}
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
            showGlossary={showGlossary}
            showDecks={showDecks}
            groupsBadge={groupsBadge}
            loansBadge={loansBadge}
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
        showGlossary={showGlossary}
        showDecks={showDecks}
        groupsBadge={groupsBadge}
        loansBadge={loansBadge}
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
