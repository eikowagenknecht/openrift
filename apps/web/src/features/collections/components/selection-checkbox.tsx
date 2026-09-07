import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface SelectionCheckboxProps {
  isSelected: boolean;
  onToggle: () => void;
}

export function SelectionCheckbox({ isSelected, onToggle }: SelectionCheckboxProps) {
  return (
    <Checkbox
      aria-label="Select card"
      checked={isSelected}
      onCheckedChange={onToggle}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "absolute top-1.5 right-1.5 z-20 size-5",
        !isSelected && "border-white/70 bg-black/30 hover:border-white",
      )}
    />
  );
}
