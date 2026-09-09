import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cloneElement, isValidElement, useId, useState } from "react";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlaceholderField } from "@/features/cards/lib/card-placeholder-regions";
import { useFieldLink } from "@/features/contribute/components/contribute-field-focus";
import { cn } from "@/lib/utils";

export interface LabelledControlProps {
  id?: string;
  "aria-labelledby"?: string;
}

// Hint renders as an info button that opens on click, not always-on helper
// text, so grid rows keep a uniform height.
export function FieldRow({
  label,
  hint,
  error,
  required,
  field,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  field?: PlaceholderField;
  children: ReactNode;
}) {
  const generatedId = useId();
  const labelId = useId();
  const link = useFieldLink(field);
  const element = isValidElement<LabelledControlProps>(children) ? children : null;
  const controlId = element?.props.id ?? generatedId;
  const control = element
    ? cloneElement(element, {
        id: controlId,
        "aria-labelledby": element.props["aria-labelledby"] ?? labelId,
      })
    : children;

  return (
    <Field
      data-invalid={error ? true : undefined}
      {...link.props}
      className={cn(link.active && "ring-primary/40 -m-1 rounded-md p-1 ring-2 transition-shadow")}
    >
      <div className="flex items-center gap-1">
        <FieldLabel id={labelId} htmlFor={controlId}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </FieldLabel>
        {hint && <FieldHint label={label} hint={hint} />}
      </div>
      {control}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}

function FieldHint({ label, hint }: { label: string; hint: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`About ${label}`}
            className="text-muted-foreground -m-1"
          />
        }
      >
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="text-muted-foreground w-64 text-sm">
        {hint}
      </PopoverContent>
    </Popover>
  );
}

export function NumberInput({
  value,
  onChange,
  id,
  "aria-labelledby": ariaLabelledBy,
}: LabelledControlProps & {
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  return (
    <Input
      id={id}
      aria-labelledby={ariaLabelledBy}
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

export function SingleSelect({
  value,
  onChange,
  options,
  labels,
  placeholder,
  id,
  "aria-labelledby": ariaLabelledBy,
}: LabelledControlProps & {
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
      <SelectTrigger id={id} aria-labelledby={ariaLabelledBy} className="w-full">
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

export function ChipInput({
  value,
  onChange,
  placeholder,
  id,
  "aria-labelledby": ariaLabelledBy,
}: LabelledControlProps & {
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
          id={id}
          aria-labelledby={ariaLabelledBy}
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

export function MultiSelectDropdown({
  value,
  onChange,
  options,
  placeholder,
  id,
  "aria-labelledby": ariaLabelledBy,
}: LabelledControlProps & {
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
        id={id}
        aria-labelledby={ariaLabelledBy}
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
