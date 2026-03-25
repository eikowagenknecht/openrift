import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { EllipsisVertical, LogOut, Menu, Moon, Shield, Sparkles, Sun, User } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsAdmin } from "@/hooks/use-admin";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { signOut, useSession } from "@/lib/auth-client";
import { useGravatarUrl } from "@/lib/gravatar";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
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
      <img src="/logo-64x64.webp" alt="OpenRift" className="size-8" />
      <h1 className="text-xl font-bold">OpenRift</h1>
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
      <Menu className="size-5" />
    </Button>
  );
}

function DesktopNav({ showCollection }: { showCollection: boolean }) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuLink
            render={<Link to="/cards" />}
            className={navigationMenuTriggerStyle()}
          >
            Cards
          </NavigationMenuLink>
        </NavigationMenuItem>
        {showCollection && (
          <NavigationMenuItem>
            <NavigationMenuLink
              render={<Link to="/collections" />}
              className={navigationMenuTriggerStyle()}
            >
              Collections
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}
      </NavigationMenuList>
    </NavigationMenu>
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
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const darkMode = theme === "dark";
  const { data: isAdmin } = useIsAdmin();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    void router.navigate({ to: "/cards" });
  };

  return (
    <div className="flex items-center gap-2">
      {!isPending && !session?.user && (
        <Button
          variant="default"
          size="sm"
          nativeButton={false} // custom: render as <Link>, not <button>
          render={<Link to="/login" search={{ redirect: undefined, email: undefined }} />}
        >
          Sign in
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}>
          {session?.user ? (
            <Avatar size="sm">
              {gravatarUrl && (
                <AvatarImage src={gravatarUrl} alt={session.user.name ?? session.user.email} />
              )}
              <AvatarFallback>
                <User className="size-3" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <EllipsisVertical className="size-5" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {session?.user && (
            <>
              <DropdownMenuItem render={<Link to="/profile" />}>
                <User className="size-4" />
                Profile
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem render={<Link to="/admin" />}>
                  <Shield className="size-4" />
                  Admin
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={toggleTheme}>
            {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {darkMode ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/changelog" />}>
            <Sparkles className="size-4" />
            What&apos;s new
          </DropdownMenuItem>
          {session?.user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function MobileNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <SheetClose
      nativeButton={false}
      render={<Link to={to} />}
      className="rounded-md px-2 py-1 hover:bg-muted"
    >
      {children}
    </SheetClose>
  );
}

function MobileNav({
  open,
  onOpenChange,
  showCollection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showCollection: boolean;
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
              <img src="/logo-64x64.webp" alt="OpenRift" className="size-6" />
              OpenRift
            </Link>
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-2 px-2">
          <MobileNavLink to="/cards">Cards</MobileNavLink>
          {showCollection && <MobileNavLink to="/collections">Collection</MobileNavLink>}
          <MobileNavLink to="/changelog">What&apos;s new</MobileNavLink>
          <MobileNavLink to="/roadmap">Roadmap</MobileNavLink>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Header() {
  const { data: session, isPending } = useSession();
  const gravatarUrl = useGravatarUrl(session?.user?.email);
  const collectionEnabled = useFeatureEnabled("collection");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const showCollection = Boolean(session?.user) && collectionEnabled;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
      {/* ⚠ h-14 is mirrored as APP_HEADER_HEIGHT in card-grid.tsx — update both together */}
      <div
        className={`${CONTAINER_WIDTH} grid h-14 grid-cols-[1fr_auto_1fr] px-3 md:grid-cols-[1fr_auto] items-center`}
      >
        {/* Left: Hamburger on mobile */}
        <MenuButton className="md:hidden" onClick={() => setMobileMenuOpen(true)} />

        {/* Left: logo + expanded menu on desktop */}
        <div className="hidden md:flex gap-4">
          <LogoLink />
          <DesktopNav showCollection={showCollection} />
        </div>

        {/* Center: Logo on mobile */}
        <LogoLink className="md:hidden" />

        {/* Right: User menu */}
        <UserMenu session={session} isPending={isPending} gravatarUrl={gravatarUrl} />
      </div>

      <MobileNav
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        showCollection={showCollection}
      />
    </header>
  );
}
