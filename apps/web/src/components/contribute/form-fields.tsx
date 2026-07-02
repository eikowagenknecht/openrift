/**
 * Reusable form primitives shared by the contribute form (ADR data entry) and
 * the card designer (ADR-023). Extracting them keeps a single source of truth
 * for the labelled field row, number input, single-select, and chip input.
 */
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A labelled field with optional required marker, hint, and inline error.
 *
 * @returns The field row element.
 */
export function FieldRow({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {children}
      {hint && !error && <FieldDescription>{hint}</FieldDescription>}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

/**
 * An integer input that maps an empty value to `null`.
 *
 * @returns The number input element.
 */
export function NumberInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <Input
      type="number"
      min={0}
      value={value === null ? "" : value.toString()}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "") {
          onChange(null);
          return;
        }
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of a form field; Number() would yield NaN on trailing text
        const parsed = Number.parseInt(next, 10);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className="[-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

/**
 * A single-select dropdown over slugs with a label lookup. Maps an empty
 * selection to `null`.
 *
 * @returns The select element.
 */
export function SingleSelect({
  value,
  onChange,
  options,
  labels,
  placeholder,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  options: readonly string[];
  labels: Record<string, string>;
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next: string | null) => onChange(next || null)}
      items={options.map((slug) => ({ value: slug, label: labels[slug] ?? slug }))}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder}>
          {(current: string) => labels[current] ?? current}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((slug) => (
          <SelectItem key={slug} value={slug}>
            {labels[slug] ?? slug}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A free-text chip input: type and press Enter or comma to add a chip.
 *
 * @returns The chip input element.
 */
export function ChipInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  };
  return (
    <Combobox<string, true>
      multiple
      items={value}
      value={value}
      onValueChange={onChange}
      inputValue={draft}
      onInputValueChange={setDraft}
    >
      <ComboboxChips>
        {value.map((chip) => (
          <ComboboxChip key={chip}>{chip}</ComboboxChip>
        ))}
        <ComboboxChipsInput
          placeholder={value.length === 0 ? placeholder : ""}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
        />
      </ComboboxChips>
    </Combobox>
  );
}

/**
 * A multi-select dropdown over `{ slug, label }` options with a chips-style
 * summary. Used for promo markers in the contribute form.
 *
 * @returns The combobox element.
 */
export function MultiSelectDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: { slug: string; label: string }[];
  placeholder: string;
}) {
  const items = options.map((opt) => opt.slug);
  const labelFor = (slug: string) => options.find((opt) => opt.slug === slug)?.label ?? slug;
  const summary = value.length === 0 ? placeholder : value.map((slug) => labelFor(slug)).join(", ");
  return (
    <Combobox<string, true>
      multiple
      items={items}
      value={value}
      onValueChange={onChange}
      itemToStringLabel={labelFor}
    >
      <ComboboxTrigger
        render={<Button variant="outline" />}
        className={cn(
          "w-full justify-between font-normal",
          value.length === 0 && "text-muted-foreground",
        )}
      >
        <span className="truncate">{summary}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-72">
        <ComboboxInput placeholder="Search markers…" showTrigger={false} />
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(slug: string) => (
            <ComboboxItem key={slug} value={slug}>
              {labelFor(slug)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
