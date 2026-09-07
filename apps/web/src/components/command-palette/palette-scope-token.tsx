import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { useCommandPaletteStore } from "@/stores/command-palette-store";

export function PaletteScopeToken({ label }: { label: string }) {
  const exitQuickAddScope = useCommandPaletteStore((state) => state.exitQuickAddScope);
  return (
    <span className="bg-muted text-foreground flex max-w-44 shrink-0 items-center gap-0.5 rounded-md py-0.5 pr-1 pl-2 text-xs font-medium">
      <span className="truncate">{label}</span>
      <ChipRemoveButton aria-label={`Leave ${label}`} onClick={exitQuickAddScope} />
    </span>
  );
}
