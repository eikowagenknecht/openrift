import { Link, useMatch, useRouter } from "@tanstack/react-router";
import {
  EllipsisVertical,
  LogOut,
  Moon,
  RefreshCw,
  Shield,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import changelogMd from "@/CHANGELOG.md?raw";
import { InstallButton } from "@/components/pwa/install-button";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
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
import { useIsAdmin } from "@/hooks/use-admin";
import { useSWUpdate } from "@/hooks/use-sw-update";
import { signOut, useSession } from "@/lib/auth-client";
import { parseChangelog } from "@/lib/changelog";
import { useGravatarUrl } from "@/lib/gravatar";

const changelogGroups = parseChangelog(changelogMd);

interface HeaderProps {
  darkMode: boolean;
  onDarkModeChange: () => void;
}

export function Header({ darkMode, onDarkModeChange }: HeaderProps) {
  const { data: session, isPending } = useSession();
  const { data: isAdmin } = useIsAdmin();
  const router = useRouter();
  const isHome = useMatch({ from: "/", shouldThrow: false });
  const gravatarUrl = useGravatarUrl(session?.user?.email);

  const { needRefresh, applyUpdate, checkForUpdate } = useSWUpdate();
  const [checking, setChecking] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  // DEBUG: touch scroll debugging for iOS
  const scrollRef = useRef<HTMLDivElement>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const addDebug = (msg: string) => setDebugLog((prev) => [...prev.slice(-15), msg]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const info = () => {
      const style = globalThis.getComputedStyle(el);
      addDebug(
        `scroll: ${el.scrollHeight}/${el.clientHeight} overflow-y: ${style.overflowY} touch: ${style.touchAction}`,
      );
    };

    const onStart = (e: TouchEvent) => {
      info();
      addDebug(
        `touchstart: target=${(e.target as HTMLElement)?.tagName} touches=${e.touches.length}`,
      );
    };
    const onMove = (e: TouchEvent) => {
      addDebug(
        `touchmove: cancelable=${e.cancelable} defaultPrevented=${e.defaultPrevented} y=${e.touches[0]?.clientY.toFixed(0)}`,
      );
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, [changelogOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        {/* ⚠ h-14 is mirrored as APP_HEADER_HEIGHT in card-grid.tsx — update both together */}
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)">
          <button
            type="button"
            className="flex cursor-pointer items-baseline gap-2"
            onClick={() => {
              if (isHome) {
                globalThis.scrollTo({ top: 0, behavior: "smooth" });
              } else {
                void router.navigate({ to: "/" });
              }
            }}
          >
            <img src="/logo-64x64.webp" alt="OpenRift" className="size-8 self-center" />
            <h1 className="text-xl font-bold tracking-tight">OpenRift</h1>
            <span className="text-sm text-muted-foreground sm:hidden">A Riftbound companion.</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Fast. Open. Ad-free. A Riftbound companion.
            </span>
          </button>
          <div className="flex items-center gap-1">
            <InstallButton />
            {!isPending && !session?.user && (
              <Button
                variant="ghost"
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
                    {needRefresh && (
                      <AvatarBadge className="bg-blue-500" /> // custom: update-available indicator
                    )}
                  </Avatar>
                ) : (
                  <span className="relative">
                    <EllipsisVertical className="size-5" />
                    {needRefresh && (
                      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-blue-500 ring-2 ring-background" /> // custom: update-available indicator
                    )}
                  </span>
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
                <DropdownMenuItem onClick={onDarkModeChange}>
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
                        void router.navigate({ to: "/" });
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
          <DrawerHeader className="pb-4">
            <DrawerTitle>What&apos;s new</DrawerTitle>
            <DrawerDescription>
              Recent changes and improvements to OpenRift.{" "}
              <span className="text-[10px] tabular-nums">{__COMMIT_HASH__}</span>
            </DrawerDescription>
          </DrawerHeader>
          <div ref={scrollRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-4 pb-4">
            {changelogGroups.map((group) => (
              <div key={group.date} className="mb-6">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{group.date}</p>
                <ul className="space-y-2">
                  {group.entries.map((entry, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium uppercase leading-none ${
                          entry.type === "feat"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        }`}
                      >
                        {entry.type}
                      </span>
                      <span>{entry.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {/* DEBUG: remove after fixing scroll */}
          <div className="shrink-0 border-t bg-black/90 p-2 font-mono text-[10px] text-green-400">
            <button
              type="button"
              className="mb-1 text-yellow-400 underline"
              onClick={() => setDebugLog([])}
            >
              clear
            </button>
            <div className="max-h-24 overflow-y-auto">
              {debugLog.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
              {debugLog.length === 0 && <div>Touch the scroll area above...</div>}
            </div>
          </div>
          <DrawerFooter className="border-t">
            {needRefresh ? (
              <Button size="sm" onClick={() => applyUpdate()} className="w-full">
                <RefreshCw className="size-3.5" />
                Update available — reload
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={async () => {
                  setChecking(true);
                  const updateAvailable = await checkForUpdate();
                  setChecking(false);
                  if (!updateAvailable) {
                    toast("You're on the latest version");
                  }
                }}
              >
                <RefreshCw className={`size-3 ${checking ? "animate-spin" : ""}`} />
                Check for updates
              </Button>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
