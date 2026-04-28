import { useQueryClient } from "@tanstack/react-query";
import { Link, useMatch, useRouter } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
  GavelIcon,
  GiftIcon,
  EllipsisVerticalIcon,
  HeartIcon,
  LayersIcon,
  LibraryIcon,
  LogOutIcon,
  MenuIcon,
  MessageSquareIcon,
  MoonIcon,
  PackagePlusIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { siDiscord, siGithub } from "simple-icons";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsAdmin } from "@/hooks/use-admin";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { clearUserScopedCache } from "@/lib/auth-cache";
import { signOut } from "@/lib/auth-client";
import { useSession } from "@/lib/auth-session";
import { useGravatarUrl } from "@/lib/gravatar";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import { useAddModeStore } from "@/stores/add-mode-store";
import { useDeckBuilderUiStore } from "@/stores/deck-builder-ui-store";
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
      <img
        src="/logo-64x64.webp"
        srcSet="/logo-64x64.webp 1x, /logo-96x96.webp 3x"
        alt="OpenRift"
        className="size-8"
      />
      <span className="text-xl font-bold">OpenRift</span>
      <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-semibold uppercase">
        Unofficial
      </span>
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

function DesktopNav({
  showRules,
  showCollection,
  showDecks,
  showPackOpener,
}: {
  showRules: boolean;
  showCollection: boolean;
  showDecks: boolean;
  showPackOpener: boolean;
}) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            render={<Link to="/cards" search={(prev) => prev} />}
            className={cn(
              navigationMenuTriggerStyle(),
              "data-[status=active]:bg-muted data-[status=active]:font-semibold",
            )}
          >
            Cards
          </NavigationMenuLink>
        </NavigationMenuItem>
        {showCollection && (
          <NavigationMenuItem>
            <NavigationMenuLink
              render={<Link to="/collections" />}
              className={cn(
                navigationMenuTriggerStyle(),
                "data-[status=active]:bg-muted data-[status=active]:font-semibold",
              )}
            >
              Collection
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}
        {showDecks && (
          <NavigationMenuItem>
            <NavigationMenuLink
              render={<Link to="/decks" />}
              className={navigationMenuTriggerStyle()}
            >
              Decks
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}
        <NavigationMenuItem>
          <NavigationMenuTrigger>More</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-64 gap-1 p-1">
              {showRules && (
                <li>
                  <NavigationMenuLink render={<Link to="/rules" />}>
                    <GavelIcon />
                    <div>
                      <div className="font-medium">Rules</div>
                      <div className="text-muted-foreground text-xs">Official rules reference</div>
                    </div>
                  </NavigationMenuLink>
                </li>
              )}
              <li>
                <NavigationMenuLink render={<Link to="/promos" />}>
                  <GiftIcon />
                  <div>
                    <div className="font-medium">Promos</div>
                    <div className="text-muted-foreground text-xs">
                      Alternate printings from events and giveaways
                    </div>
                  </div>
                </NavigationMenuLink>
              </li>
              {showPackOpener && (
                <li>
                  <NavigationMenuLink render={<Link to="/pack-opener" />}>
                    <PackagePlusIcon />
                    <div>
                      <div className="font-medium">Pack opener</div>
                      <div className="text-muted-foreground text-xs">
                        Simulate opening boosters with real pull rates
                      </div>
                    </div>
                  </NavigationMenuLink>
                </li>
              )}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}

function UserMenuTrigger({
  user,
  gravatarUrl,
}: {
  user: { name: string; email: string } | undefined;
  gravatarUrl: string | undefined;
}) {
  if (user) {
    return (
      <Avatar size="sm">
        {gravatarUrl && <AvatarImage src={gravatarUrl} alt={user.name ?? user.email} />}
        <AvatarFallback>
          <UserIcon className="size-3" />
        </AvatarFallback>
      </Avatar>
    );
  }
  return <EllipsisVerticalIcon className="size-5" />;
}

function UserMenuItems({ isLoggedIn }: { isLoggedIn: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const darkMode = theme === "dark";
  const { data: isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    await clearUserScopedCache(queryClient);
    useDisplayStore.getState().reset();
    useThemeStore.getState().reset();
    useAddModeStore.getState().reset();
    useDeckBuilderUiStore.getState().reset();
    void router.navigate({ to: "/cards", search: {} });
  };

  return (
    <DropdownMenuContent align="end">
      {isLoggedIn && (
        <DropdownMenuItem render={<Link to="/profile" />}>
          <UserIcon className="size-4" />
          Profile
        </DropdownMenuItem>
      )}
      {isLoggedIn && isAdmin && (
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
  gravatarUrl,
}: {
  session: ReturnType<typeof useSession>["data"];
  isPending: boolean;
  gravatarUrl: string | undefined;
}) {
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
          <UserMenuTrigger user={user} gravatarUrl={gravatarUrl} />
        </DropdownMenuTrigger>
        <UserMenuItems isLoggedIn={Boolean(user)} />
      </DropdownMenu>
    </div>
  );
}

function MobileNavLink({
  to,
  search,
  icon,
  children,
}: {
  to: string;
  search?: (prev: Record<string, unknown>) => Record<string, unknown>;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <SheetClose
      nativeButton={false}
      render={<Link to={to} search={search} />}
      className="hover:bg-muted data-[status=active]:bg-muted flex items-center gap-3 rounded-lg px-3 py-3.5 text-base data-[status=active]:font-semibold"
    >
      {icon}
      {children}
    </SheetClose>
  );
}

function MobileNav({
  open,
  onOpenChange,
  showRules,
  showCollection,
  showDecks,
  showPackOpener,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showRules: boolean;
  showCollection: boolean;
  showDecks: boolean;
  showPackOpener: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>
            <Link
              to="/cards"
              className="flex items-center gap-2 font-bold"
              onClick={() => onOpenChange(false)}
            >
              <img
                src="/logo-64x64.webp"
                srcSet="/logo-64x64.webp 1x, /logo-96x96.webp 3x"
                alt="OpenRift"
                className="size-6"
              />
              OpenRift
              <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-semibold uppercase">
                Unofficial
              </span>
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
          {showCollection && (
            <MobileNavLink
              to="/collections"
              icon={<LibraryIcon className="text-muted-foreground size-5" />}
            >
              Collection
            </MobileNavLink>
          )}
          {showDecks && (
            <MobileNavLink
              to="/decks"
              icon={<BookOpenIcon className="text-muted-foreground size-5" />}
            >
              Decks
            </MobileNavLink>
          )}
          <div className="text-muted-foreground mt-3 px-3 pb-1 font-semibold tracking-wide uppercase">
            More
          </div>
          {showRules && (
            <MobileNavLink
              to="/rules"
              icon={<GavelIcon className="text-muted-foreground size-5" />}
            >
              Rules
            </MobileNavLink>
          )}
          <MobileNavLink to="/promos" icon={<GiftIcon className="text-muted-foreground size-5" />}>
            Promos
          </MobileNavLink>
          {showPackOpener && (
            <MobileNavLink
              to="/pack-opener"
              icon={<PackagePlusIcon className="text-muted-foreground size-5" />}
            >
              Pack opener
            </MobileNavLink>
          )}
        </nav>
        <SheetFooter className="border-t px-4 pt-4">
          <a
            href="https://discord.gg/Qb6RcjXq6z"
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

function FeedbackPopover() {
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
        <a
          href="https://discord.gg/Qb6RcjXq6z"
          target="_blank"
          rel="noreferrer"
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
        </a>
        <a
          href="https://github.com/eikowagenknecht/openrift/issues/new/choose"
          target="_blank"
          rel="noreferrer"
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
        </a>
      </PopoverContent>
    </Popover>
  );
}

export function Header() {
  const { data: session, isPending } = useSession();
  const gravatarUrl = useGravatarUrl(session?.user?.email);
  const rulesEnabled = useFeatureEnabled("rules");
  const packOpenerEnabled = useFeatureEnabled("packopener");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showRules = rulesEnabled;
  const showPackOpener = packOpenerEnabled;
  const showCollection = Boolean(session?.user);
  const showDecks = Boolean(session?.user);

  return (
    <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-lg">
      {/* \u26a0 h-14 is mirrored as APP_HEADER_HEIGHT in card-grid.tsx \u2014 update both together */}
      <div
        className={`${CONTAINER_WIDTH} grid h-14 grid-cols-[1fr_auto_1fr] items-center px-3 md:grid-cols-[1fr_auto]`}
      >
        {/* Left: Hamburger on mobile */}
        <div className="flex items-center gap-1 md:hidden">
          <MenuButton onClick={() => setMobileMenuOpen(true)} />
        </div>

        {/* Left: logo + expanded menu on desktop */}
        <div className="hidden gap-4 md:flex">
          <LogoLink />
          <DesktopNav
            showRules={showRules}
            showCollection={showCollection}
            showDecks={showDecks}
            showPackOpener={showPackOpener}
          />
        </div>

        {/* Center: Logo on mobile */}
        <LogoLink className="md:hidden" />

        {/* Right: Feedback + Support + User menu */}
        <div className="flex items-center gap-1 justify-self-end">
          <FeedbackPopover />
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
          <UserMenu session={session} isPending={isPending} gravatarUrl={gravatarUrl} />
        </div>
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        showRules={showRules}
        showCollection={showCollection}
        showDecks={showDecks}
        showPackOpener={showPackOpener}
      />
    </header>
  );
}
