import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { EllipsisVertical, LogOut, Moon, Shield, Sparkles, Sun, User } from "lucide-react";
import { useState } from "react";

import { ChangelogDrawer } from "@/components/layout/changelog-drawer";
import { InstallButton } from "@/components/pwa/install-button";
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
import { useIsAdmin } from "@/hooks/use-admin";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { signOut, useSession } from "@/lib/auth-client";
import { useGravatarUrl } from "@/lib/gravatar";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";

export function Header() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const darkMode = theme === "dark";
  const { data: session, isPending } = useSession();
  const { data: isAdmin } = useIsAdmin();
  const router = useRouter();
  const isHome = useMatch({ from: "/_app/cards", shouldThrow: false });
  const gravatarUrl = useGravatarUrl(session?.user?.email);

  const collectionEnabled = useFeatureEnabled("collection");
  const [changelogOpen, setChangelogOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    void router.navigate({ to: "/cards" });
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        {/* ⚠ h-14 is mirrored as APP_HEADER_HEIGHT in card-grid.tsx — update both together */}
        <div className={`${CONTAINER_WIDTH} flex h-14 items-center justify-between px-4`}>
          <div className="flex items-center gap-4">
            <Link
              to="/cards"
              className="flex items-center gap-2"
              onClick={(e) => {
                if (isHome) {
                  e.preventDefault();
                  globalThis.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
            >
              <img src="/logo-64x64.webp" alt="OpenRift" className="size-8 self-center" />
              <h1 className="text-xl font-bold tracking-tight">OpenRift</h1>
            </Link>
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    render={<Link to="/cards" />}
                    className={cn(navigationMenuTriggerStyle(), "h-7")}
                  >
                    Cards
                  </NavigationMenuLink>
                </NavigationMenuItem>
                {session?.user && collectionEnabled && (
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      render={<Link to="/collections" />}
                      className={cn(navigationMenuTriggerStyle(), "h-7")}
                    >
                      Collection
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                )}
              </NavigationMenuList>
            </NavigationMenu>
          </div>
          <div className="flex items-center gap-1">
            <InstallButton />
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
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Menu" />}
              >
                {session?.user ? (
                  <Avatar size="sm">
                    {gravatarUrl && (
                      <AvatarImage
                        src={gravatarUrl}
                        alt={session.user.name ?? session.user.email}
                      />
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
                <DropdownMenuItem onClick={() => setChangelogOpen(true)}>
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
        </div>
      </header>

      <ChangelogDrawer open={changelogOpen} onOpenChange={setChangelogOpen} />
    </>
  );
}
