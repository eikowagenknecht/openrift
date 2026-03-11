import { Link, useMatch, useRouter } from "@tanstack/react-router";
import {
  EllipsisVertical,
  LogOut,
  Map,
  Moon,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import changelogMd from "@/CHANGELOG.md?raw";
import { InstallButton } from "@/components/pwa/install-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { useSWUpdate } from "@/hooks/use-sw-update";
import { signOut, useSession } from "@/lib/auth-client";
import { parseChangelog } from "@/lib/changelog";
import { featureEnabled } from "@/lib/feature-flags";
import { useGravatarUrl } from "@/lib/gravatar";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";

const changelogGroups = parseChangelog(changelogMd);

function formatRelativeDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86_400_000);

  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  if (diffDays < 14) {
    return "Last week";
  }
  if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }
  if (diffDays < 60) {
    return "Last month";
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function Header() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const darkMode = theme === "dark";
  const { data: session, isPending } = useSession();
  const { data: isAdmin } = useIsAdmin();
  const router = useRouter();
  const isHome = useMatch({ from: "/cards", shouldThrow: false });
  const gravatarUrl = useGravatarUrl(session?.user?.email);

  const { checkForUpdate } = useSWUpdate();
  const [checking, setChecking] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  // HACK: work around base-ui#4180 — side drawers block vertical touch scroll.
  // Fixed upstream in base-ui#4187 (merged 2026-03-04, not yet in a stable release).
  // Remove this workaround after upgrading @base-ui/react past 1.2.0.
  // How it works: stopping touchstart/touchmove propagation prevents the Viewport's
  // React handler from setting its internal touchScrollStateRef, so the document-level
  // capture handler returns early without calling preventDefault().
  // Trade-off: swipe-to-dismiss doesn't work from inside the scroll area.
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const scrollRef = (el: HTMLDivElement | null) => {
    scrollCleanupRef.current?.();
    scrollCleanupRef.current = null;
    if (!el) {
      return;
    }

    const stopTouch = (e: TouchEvent) => e.stopPropagation();
    el.addEventListener("touchstart", stopTouch, { passive: true });
    el.addEventListener("touchmove", stopTouch, { passive: true });
    scrollCleanupRef.current = () => {
      el.removeEventListener("touchstart", stopTouch);
      el.removeEventListener("touchmove", stopTouch);
    };
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        {/* ⚠ h-14 is mirrored as APP_HEADER_HEIGHT in card-grid.tsx — update both together */}
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2"
              onClick={() => {
                if (isHome) {
                  globalThis.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                  void router.navigate({ to: "/cards" });
                }
              }}
            >
              <img src="/logo-64x64.webp" alt="OpenRift" className="size-8 self-center" />
              <h1 className="text-xl font-bold tracking-tight">OpenRift</h1>
            </button>
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
                {session?.user && featureEnabled("collection") && (
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
                    <DropdownMenuItem
                      onClick={async () => {
                        await signOut();
                        void router.navigate({ to: "/cards" });
                      }}
                    >
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

      <Drawer swipeDirection="right" open={changelogOpen} onOpenChange={setChangelogOpen}>
        <DrawerContent className="flex flex-col gap-0 overflow-hidden">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <DrawerHeader className="px-0 pb-4 pt-2">
              <DrawerTitle>What&apos;s new</DrawerTitle>
              <DrawerDescription>
                Recent changes and improvements.{" "}
                <span className="text-[10px] tabular-nums">{__COMMIT_HASH__}</span>{" "}
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-baseline gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    setChecking(true);
                    setSpinning(true);
                    await checkForUpdate();
                    setChecking(false);
                    toast("You're on the latest version");
                  }}
                >
                  <RefreshCw
                    className={`size-2.5 self-center ${spinning ? "animate-spin" : ""}`}
                    onAnimationIteration={() => {
                      if (!checking) {
                        setSpinning(false);
                      }
                    }}
                  />
                  Check for updates
                </button>
              </DrawerDescription>
            </DrawerHeader>
            <Link
              to="/roadmap"
              onClick={() => setChangelogOpen(false)}
              className="mb-4 flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Map className="size-4" />
              View the roadmap
            </Link>
            {changelogGroups.map((group) => (
              <div key={group.date} className="mb-4">
                <div className="sticky top-0 z-10 -mx-4 flex items-baseline gap-3 border-b border-border bg-background px-4 pb-2 pt-3 shadow-[0_2px_4px_-2px_var(--color-border)]">
                  <span className="text-sm font-semibold text-foreground">
                    {formatRelativeDate(group.date)}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {group.date}
                  </span>
                </div>
                <ul className="space-y-2 pt-2">
                  {group.entries.map((entry, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="relative mt-1 inline-flex w-8 shrink-0 items-center justify-center px-1">
                        <span
                          className={`absolute inset-0 -skew-x-[15deg] ${
                            entry.type === "feat" ? "bg-[#24705f]" : "bg-[#cd346f]"
                          }`}
                        />
                        <span className="relative text-[10px] font-semibold uppercase italic leading-none tracking-tight text-white">
                          {entry.type}
                        </span>
                      </span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
