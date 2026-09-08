import type { RuleQuantity } from "@openrift/shared/types/list-rule";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNumericDraft } from "@/hooks/use-numeric-draft";

const QUANTITY_MODES = [
  { value: "fixed", label: "Fixed" },
  { value: "playset", label: "Playset ×" },
] as const;

export function QuantityControl({
  value,
  onChange,
}: {
  value: RuleQuantity;
  onChange: (next: RuleQuantity) => void;
}) {
  const amount = value.mode === "fixed" ? value.n : value.multiplier;
  const { inputProps, resetDraft } = useNumericDraft({
    display: String(amount),
    onCommit: (text) => {
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- lenient parse of an input value; Number() would yield NaN on trailing text
      const parsed = Number.parseInt(text, 10);
      if (Number.isNaN(parsed)) {
        return;
      }
      onChange(
        value.mode === "fixed"
          ? { mode: "fixed", n: Math.max(0, parsed) }
          : { mode: "playset", multiplier: Math.max(1, parsed) },
      );
    },
  });
  return (
    <div className="flex items-center gap-2">
      <Select
        items={QUANTITY_MODES}
        value={value.mode}
        onValueChange={(mode) => {
          resetDraft();
          onChange(mode === "fixed" ? { mode: "fixed", n: 1 } : { mode: "playset", multiplier: 1 });
        }}
      >
        <SelectTrigger className="w-36" aria-label="Quantity mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {QUANTITY_MODES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        type="number"
        className="w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        min={value.mode === "fixed" ? 0 : 1}
        aria-label="Quantity amount"
        {...inputProps}
      />
    </div>
  );
}
