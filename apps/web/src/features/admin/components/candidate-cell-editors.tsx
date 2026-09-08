import { useEffect, useRef, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChipInput } from "@/features/contribute/components/form-fields";
import { cn } from "@/lib/utils";

export function SuggestionCombobox({
  suggestions,
  defaultValue,
  onCommit,
  onCancel,
}: {
  suggestions: readonly string[];
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [inputValue, setInputValue] = useState(defaultValue);

  return (
    <Command
      shouldFilter
      className="border-primary rounded-md border"
      onClick={(event: React.MouseEvent) => event.stopPropagation()}
    >
      <CommandInput
        value={inputValue}
        onValueChange={setInputValue}
        placeholder="Type or select…"
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(inputValue);
          } else if (event.key === "Escape") {
            onCancel();
          }
        }}
      />
      <CommandList>
        <CommandEmpty className="px-2 py-1.5">No matches</CommandEmpty>
        {suggestions.map((suggestion) => (
          <CommandItem key={suggestion} value={suggestion} onSelect={(value) => onCommit(value)}>
            {suggestion}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

export function TagChipCell({
  value,
  placeholder,
  onChange,
  onDone,
}: {
  value: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
  onDone: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wrapRef.current?.querySelector("input")?.focus();
  }, []);
  return (
    <div
      ref={wrapRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onDone();
        }
      }}
    >
      <ChipInput value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}

export function MultiSelectCell({
  label,
  options,
  value,
  onCommit,
  onClose,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onCommit: (next: string[] | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(value);
  const items = options.map((opt) => opt.value);
  const labelFor = (item: string) => options.find((opt) => opt.value === item)?.label ?? item;
  const summary = draft.length > 0 ? draft.map((item) => labelFor(item)).join(", ") : "— select —";
  return (
    <Combobox<string, true>
      multiple
      open
      items={items}
      value={draft}
      onValueChange={(next: string[]) => setDraft(next)}
      itemToStringLabel={labelFor}
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        const original = new Set(value);
        const changed = draft.length !== value.length || draft.some((item) => !original.has(item));
        if (changed) {
          onCommit(draft.length > 0 ? draft : null);
        }
        onClose();
      }}
    >
      <ComboboxTrigger
        render={
          // oxlint-disable-next-line react/forbid-elements -- cell inline-edit trigger; needs full-width chrome-free layout Button can't provide
          <button
            type="button"
            aria-label={`Edit ${label}`}
            className="flex w-full items-center gap-1 rounded-md text-left text-sm"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
          />
        }
      >
        <span
          className={cn("min-w-0 flex-1 truncate", draft.length === 0 && "text-muted-foreground")}
          title={draft.length > 0 ? summary : undefined}
        >
          {summary}
        </span>
      </ComboboxTrigger>
      <ComboboxContent className="w-max max-w-[90vw] min-w-56">
        <ComboboxInput placeholder={`Search ${label.toLowerCase()}…`} showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {labelFor(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
