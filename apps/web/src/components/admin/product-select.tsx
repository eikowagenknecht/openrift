import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { SourceMappingConfig, StagedProduct } from "./price-mappings-types";
import { formatCents } from "./price-mappings-utils";

export function ProductSelect({
  config,
  stagedProducts,
  assignedProducts,
  currentPrintingId,
  disabled,
  onSelect,
}: {
  config: SourceMappingConfig;
  stagedProducts: StagedProduct[];
  assignedProducts: StagedProduct[];
  currentPrintingId: string;
  disabled?: boolean;
  onSelect: (externalId: number) => void;
}) {
  const sortedStaged = stagedProducts.toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );
  const sortedAssigned = assignedProducts.toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );

  return (
    <Select
      value=""
      onValueChange={(val) => {
        if (val) {
          onSelect(Number(val.split("::")[0]));
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger
        className="w-full"
        aria-label={`Assign ${config.shortName} product to printing ${currentPrintingId}`}
      >
        <SelectValue placeholder="Assign product…" />
      </SelectTrigger>
      <SelectContent className="w-auto min-w-[var(--anchor-width)]">
        {sortedStaged.length > 0 && (
          <SelectGroup>
            <SelectLabel>Staged</SelectLabel>
            {sortedStaged.map((p, i) => (
              <SelectItem key={`s::${p.externalId}::${i}`} value={`${p.externalId}::s${i}`}>
                {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} ·{" "}
                {p.finish} · {formatCents(p.marketCents, p.currency)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {sortedAssigned.length > 0 && (
          <SelectGroup>
            <SelectLabel>Assigned</SelectLabel>
            {sortedAssigned.map((p, i) => (
              <SelectItem key={`a::${p.externalId}::${i}`} value={`${p.externalId}::a${i}`}>
                {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} ·{" "}
                {p.finish} · {formatCents(p.marketCents, p.currency)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
