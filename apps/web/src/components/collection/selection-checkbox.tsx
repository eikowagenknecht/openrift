import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectionCheckboxProps {
  isSelected: boolean;
  onToggle: () => void;
}

export function SelectionCheckbox({ isSelected, onToggle }: SelectionCheckboxProps) {
  return (
    <button
      type="button"
      aria-label="Select card"
      className={cn(
        "absolute top-3 left-3 z-20 flex size-5 cursor-pointer items-center justify-center rounded border transition-all",
        isSelected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/70 bg-black/30 text-transparent hover:border-white hover:text-white/70",
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Check className="size-3" />
    </button>
  );
}
