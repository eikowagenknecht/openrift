import { SearchIcon, XIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useEffect, useRef } from "react";

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
   * In-field adornment after the magnifier icon. Clicks on non-interactive
   * parts focus the input; buttons inside (e.g. a chip's remove X) keep their
   * own clicks.
   */
  leading?: ReactNode;
  /** Right-aligned trailing text, e.g. a `"12 / 40 decks"` result count. */
  trailing?: ReactNode;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /**
   * Backspace pressed while the field is empty (drops the adornment shown in
   * `leading`). Soft keyboards may not fire a matching key event, so both
   * signals are watched.
   */
  onBackspaceEmpty?: () => void;
}

/**
 * Presentational search box shared by every search surface: a left magnifier
 * icon, the input, a right-aligned result count, and a clear button that shows
 * once there's a value. Built on InputGroup, so the addons sit in flex flow
 * and the typed text can never run under them.
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
  onBackspaceEmpty,
}: SearchInputProps) {
  const clear = onClear ?? (() => onValueChange(""));
  const hasLeading = leading !== undefined && leading !== null;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (onBackspaceEmpty && value === "" && event.key === "Backspace") {
      onBackspaceEmpty();
    }
    onKeyDown?.(event);
  };

  // Android soft keyboards can report delete as `Unidentified`, so the key
  // handler above misses it; `beforeinput` catches it (React's synthetic
  // onBeforeInput never fires for deletions).
  const node = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = node.current;
    if (!input || !onBackspaceEmpty) {
      return;
    }
    const onBeforeInput = (event: Event) => {
      if (input.value === "" && (event as InputEvent).inputType === "deleteContentBackward") {
        onBackspaceEmpty();
      }
    };
    input.addEventListener("beforeinput", onBeforeInput);
    return () => input.removeEventListener("beforeinput", onBeforeInput);
  }, [onBackspaceEmpty]);

  const setInputRef = (input: HTMLInputElement | null) => {
    node.current = input;
    assignRef(inputRef, input);
  };

  return (
    <InputGroup className={className}>
      <InputGroupAddon className={cn(hasLeading && "max-w-[50%]")}>
        <SearchIcon className="shrink-0" />
        {hasLeading && <span className="flex min-w-0 items-center">{leading}</span>}
      </InputGroupAddon>
      <InputGroupInput
        ref={setInputRef}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
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

/**
 * Must stay at module scope: the React Compiler treats `ref.current` assignment
 * inside the component as mutating a prop.
 */
function assignRef(ref: Ref<HTMLInputElement> | undefined, node: HTMLInputElement | null) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
