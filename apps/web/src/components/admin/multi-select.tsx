import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { CardIcon } from "@/components/card-icon";
import { Label } from "@/components/ui/label";

export function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  iconPath,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  iconPath?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const summary = selected.size === 0 ? "None" : [...selected].join(", ");

  return (
    <div className="relative space-y-1">
      <Label className="text-xs">{label}</Label>
      <button
        type="button"
        className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm shadow-xs"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => onToggle(opt)}
                className="size-3.5 rounded border-border"
              />
              {iconPath && <CardIcon src={iconPath(opt)} />}
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
