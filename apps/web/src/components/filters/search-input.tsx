import { SearchIcon, XIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useLayoutEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Width of the magnifier zone (matches the input's default `pl-9`). */
const ICON_ZONE_PX = 36;
/** Gap between a leading adornment and the typed text. */
const LEADING_GAP_PX = 6;

interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Clear handler. Defaults to clearing via `onValueChange("")`. */
  onClear?: () => void;
  placeholder?: string;
  /** Accessible name for the input (defaults to the placeholder). */
  ariaLabel?: string;
  /**
   * In-field adornment after the magnifier icon, e.g. a search-scope chip.
   * The typed text is padded past it (measured live), and clicks fall
   * through to the input, so keep it non-interactive.
   */
  leading?: ReactNode;
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
  leading,
  trailing,
  className,
  inputRef,
  onFocus,
  onBlur,
  onKeyDown,
}: SearchInputProps) {
  const clear = onClear ?? (() => onValueChange(""));
  const hasLeading = leading !== undefined && leading !== null;

  // The leading adornment's width is content-dependent (e.g. "in: name,
  // keywords"), so the text inset is measured rather than a fixed class.
  const leadingRef = useRef<HTMLSpanElement>(null);
  const [leadingWidth, setLeadingWidth] = useState(0);
  useLayoutEffect(() => {
    const el = leadingRef.current;
    if (!el) {
      setLeadingWidth(0);
      return;
    }
    setLeadingWidth(el.offsetWidth);
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      setLeadingWidth(Math.round(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasLeading]);

  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      {hasLeading && (
        <span
          ref={leadingRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-9 flex max-w-[45%] -translate-y-1/2 items-center"
        >
          {leading}
        </span>
      )}
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
        style={
          hasLeading ? { paddingLeft: ICON_ZONE_PX + leadingWidth + LEADING_GAP_PX } : undefined
        }
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
