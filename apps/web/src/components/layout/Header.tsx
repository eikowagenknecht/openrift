import type { ReactNode } from "react";

import { InstallButton } from "@/components/pwa/InstallButton";

interface HeaderProps {
  actions?: ReactNode;
}

export function Header({ actions }: HeaderProps) {
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
          {actions}
        </div>
      </div>
    </header>
  );
}
