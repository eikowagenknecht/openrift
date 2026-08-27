import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

/**
 * The "you are inside a quick-add" marker, rendered as a token in the search
 * box's leading slot rather than as a row of its own.
 *
 * Inside the input for one reason: it puts the scope immediately left of the
 * caret, which makes Backspace-to-leave the thing Backspace already does
 * everywhere else instead of a shortcut that has to be advertised. It also
 * frees the placeholder, which used to repeat the destination one line below
 * the old chip and then vanish the moment you typed, taking the only on-screen
 * statement of where the card was going with it.
 *
 * Replaces the search icon rather than sitting beside it: on a 448px dialog the
 * icon buys nothing next to a token that already says this is a scoped search.
 *
 * @returns The scope token.
 */
export function PaletteScopeToken({ label }: { label: string }) {
  const exitQuickAddScope = useCommandPaletteStore((state) => state.exitQuickAddScope);
  return (
    <span className="bg-muted text-foreground flex max-w-44 shrink-0 items-center gap-0.5 rounded-md py-0.5 pr-1 pl-2 text-xs font-medium">
      <span className="truncate">{label}</span>
      <ChipRemoveButton aria-label={`Leave ${label}`} onClick={exitQuickAddScope} />
    </span>
  );
}
