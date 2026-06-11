import { SearchIcon, XIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Clear handler. Defaults to clearing via `onValueChange("")`. */
  onClear?: () => void;
  placeholder?: string;
  /** Accessible name for the input (defaults to the placeholder). */
  ariaLabel?: string;
  /** Right-aligned trailing text, e.g. a `"12 / 40 decks"` result count. */
  trailing?: ReactNode;
  /** Extra classes for the relative wrapper (e.g. `flex-1 min-w-[200px]`). */
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Presentational search box shared by every search surface: a left magnifier
 * icon, the input, a right-aligned result count, and a clear button that shows
 * once there's a value. Surfaces layer their own behaviour (scope chips, URL
 * sync, store wiring) on top by passing handlers and the formatted `trailing`
 * count.
 *
 * @returns The search input box.
 */
export function SearchInput({
  value,
  onValueChange,
  onClear,
  placeholder,
  ariaLabel,
  trailing,
  className,
  inputRef,
  onFocus,
  onBlur,
  onKeyDown,
}: SearchInputProps) {
  const clear = onClear ?? (() => onValueChange(""));
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={cn("pl-9", value ? "pr-28" : "pr-20")}
      />
      <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
        {trailing !== undefined && (
          <span className="text-muted-foreground pointer-events-none text-xs">{trailing}</span>
        )}
        {value && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={clear}
            aria-label="Clear search"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}
