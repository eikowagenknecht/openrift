import { SearchIcon, TriangleAlertIcon } from "lucide-react";

/**
 * Stands in while the palette's chunk and the catalog land.
 *
 * Its own module, together with {@link GlobalPaletteError}, so the shell can
 * render both without importing the body it is waiting on — which is the whole
 * point of loading that body lazily.
 *
 * @returns The loading row.
 */
export function GlobalPaletteFallback() {
  return (
    <div className="text-muted-foreground flex h-32 items-center justify-center gap-2 text-sm">
      <SearchIcon className="size-4 animate-pulse" />
      Loading cards...
    </div>
  );
}

/**
 * Shown when the catalog fetch fails.
 *
 * The palette reads the catalog through a suspending query, so without a
 * boundary here a failed fetch escapes to the route's error component and a
 * bad connection turns opening the palette into losing the page.
 *
 * @returns The error row.
 */
export function GlobalPaletteError() {
  return (
    <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-1 px-6 text-center text-sm">
      <TriangleAlertIcon className="size-4" />
      <span>Couldn&apos;t load cards.</span>
      <span className="text-xs">Close this and try again.</span>
    </div>
  );
}
