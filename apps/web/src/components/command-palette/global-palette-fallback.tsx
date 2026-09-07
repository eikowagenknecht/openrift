import { SearchIcon, TriangleAlertIcon } from "lucide-react";

export function GlobalPaletteFallback() {
  return (
    <div className="text-muted-foreground flex h-32 items-center justify-center gap-2 text-sm">
      <SearchIcon className="size-4 animate-pulse" />
      Loading cards...
    </div>
  );
}

export function GlobalPaletteError() {
  return (
    <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-1 px-6 text-center text-sm">
      <TriangleAlertIcon className="size-4" />
      <span>Couldn&apos;t load cards.</span>
      <span className="text-xs">Close this and try again.</span>
    </div>
  );
}
