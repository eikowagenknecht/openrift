import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-bold tracking-tight">OpenRift</h1>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Fast, open, ad-free card browser
          </span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
