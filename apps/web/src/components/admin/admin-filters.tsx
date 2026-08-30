import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** One choice in an {@link AdminFilterSelect}. */
export interface AdminFilterOption {
  value: string;
  label: string;
}

/**
 * A dropdown filter in an admin toolbar's filter row. The off state is one of
 * the options, which each page names for itself.
 *
 * `label` is required rather than optional: `SelectValue` renders the selection
 * alone, so without it the trigger reaches a screen reader as an unnamed
 * combobox.
 *
 * @returns The filter dropdown.
 */
export function AdminFilterSelect({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: AdminFilterOption[];
  /** Accessible name for the trigger, e.g. "Triage state". */
  label: string;
  /** Width class for the trigger, e.g. "w-44". */
  className?: string;
}) {
  // BaseUI types a single select's value as nullable for the case where an item
  // carries null; every option here has a string value, so null never arrives.
  function pick(next: string | null) {
    if (next !== null) {
      onChange(next);
    }
  }

  return (
    <Select items={options} value={value} onValueChange={pick}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A boolean filter in an admin toolbar's filter row. The label is clickable, so
 * `id` has to be unique on the page.
 *
 * @returns The filter switch and its label.
 */
export function AdminFilterSwitch({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id}>{children}</Label>
    </div>
  );
}
