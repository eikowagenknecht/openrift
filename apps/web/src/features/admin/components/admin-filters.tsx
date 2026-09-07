import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface AdminFilterOption {
  value: string;
  label: string;
}

/**
 * `label` is required: `SelectValue` renders the selection alone, so without
 * it the trigger reaches a screen reader as an unnamed combobox.
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
  label: string;
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
