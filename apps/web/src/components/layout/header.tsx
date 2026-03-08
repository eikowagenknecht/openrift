import { Link, useMatch, useRouter } from "@tanstack/react-router";
import { LogOut, Shield, User } from "lucide-react";
import type { ReactNode } from "react";

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
import { useIsAdmin } from "@/hooks/use-admin";
import { signOut, useSession } from "@/lib/auth-client";
import { useGravatarUrl } from "@/lib/gravatar";

interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const { data: session, isPending } = useSession();
  const { data: isAdmin } = useIsAdmin();
  const router = useRouter();
  const isHome = useMatch({ from: "/", shouldThrow: false });
  const gravatarUrl = useGravatarUrl(session?.user?.email);

  return (
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
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="User menu" />}
              >
                <Avatar size="sm">
                  {gravatarUrl && (
                    <AvatarImage src={gravatarUrl} alt={session.user.name ?? session.user.email} />
                  )}
                  <AvatarFallback>
                    <User className="size-3" />
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    void router.navigate({ to: "/" });
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
