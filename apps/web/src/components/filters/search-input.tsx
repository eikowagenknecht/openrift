import { SearchIcon, XIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";

import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

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
   * Clicks on it focus the input (InputGroup's addon delegation), so keep it
   * non-interactive.
   */
  leading?: ReactNode;
  /** Right-aligned trailing text, e.g. a `"12 / 40 decks"` result count. */
  trailing?: ReactNode;
  /** Extra classes for the group wrapper (e.g. `flex-1 min-w-[200px]`). */
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
 * count. Built on InputGroup, so the addons sit in flex flow and the typed
 * text can never run under them.
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

  return (
    <InputGroup className={className}>
      <InputGroupAddon className={cn(hasLeading && "max-w-[50%]")}>
        <SearchIcon className="shrink-0" />
        {hasLeading && (
          <span aria-hidden="true" className="flex min-w-0 items-center">
            {leading}
          </span>
        )}
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {(trailing !== undefined || value) && (
        // has-[>button]:mr-0 cancels the addon's negative pull (meant for padded ghost
        // InputGroupButtons) — the bare chip X otherwise sits almost flush against the group border
        <InputGroupAddon align="inline-end" className="has-[>button]:mr-0">
          {trailing !== undefined && (
            <span className="pointer-events-none text-xs font-normal">{trailing}</span>
          )}
          {value && (
            <ChipRemoveButton className="ml-0" onClick={clear} aria-label="Clear search">
              <XIcon className="size-3.5" />
            </ChipRemoveButton>
          )}
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
