import { Link, useRouter } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import type { ReactNode } from "react";

import { InstallButton } from "@/components/pwa/InstallButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";

interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)">
        <button
          type="button"
          className="flex cursor-pointer items-baseline gap-2"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <img src="/logo.webp" alt="OpenRift" className="size-8 self-center" />
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
              render={<Link to="/login" search={{ redirect: "/" }} />}
            >
              Sign in
            </Button>
          )}
          {session?.user && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon-sm" aria-label="User menu">
                  <User className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link to="/profile" />}>
                  <User className="size-4" />
                  Profile
                </DropdownMenuItem>
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
