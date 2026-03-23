import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  printingFinish,
  disabled,
  onSelect,
}: {
  config: SourceMappingConfig;
  stagedProducts: StagedProduct[];
  assignedProducts: StagedProduct[];
  currentPrintingId: string;
  printingFinish: string;
  disabled?: boolean;
  onSelect: (externalId: number) => void;
}) {
  const [mismatchConfirm, setMismatchConfirm] = useState<{
    externalId: number;
    productFinish: string;
  } | null>(null);

  const allProducts = [...stagedProducts, ...assignedProducts];

  const sortedStaged = stagedProducts.toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );
  const sortedAssigned = assignedProducts.toSorted(
    (a, b) => a.productName.localeCompare(b.productName) || b.finish.localeCompare(a.finish),
  );

  function handleValueChange(val: string) {
    if (!val) {
      return;
    }
    const externalId = Number(val.split("::")[0]);
    const product = allProducts.find((p) => p.externalId === externalId);
    if (product && product.finish.toLowerCase() !== printingFinish.toLowerCase()) {
      setMismatchConfirm({ externalId, productFinish: product.finish });
    } else {
      onSelect(externalId);
    }
  }

  return (
    <>
      <Select value="" onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger
          className="w-full"
          aria-label={`Assign ${config.shortName} product to printing ${currentPrintingId}`}
        >
          <SelectValue placeholder={`Assign ${config.shortName} product…`} />
        </SelectTrigger>
        <SelectContent className="w-auto min-w-[var(--anchor-width)]">
          {sortedStaged.length > 0 && (
            <SelectGroup>
              <SelectLabel>Unassigned</SelectLabel>
              {sortedStaged.map((p, i) => (
                <SelectItem key={`s::${p.externalId}::${i}`} value={`${p.externalId}::s${i}`}>
                  {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} · #
                  {p.externalId} · {p.groupName ? `${p.groupName} · ` : ""}
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
                  {p.productName.length > 30 ? `${p.productName.slice(0, 30)}…` : p.productName} · #
                  {p.externalId} · {p.groupName ? `${p.groupName} · ` : ""}
                  {p.finish} · {formatCents(p.marketCents, p.currency)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      <AlertDialog
        open={mismatchConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMismatchConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finish mismatch</AlertDialogTitle>
            <AlertDialogDescription>
              The printing is <strong>{printingFinish}</strong> but the selected product is{" "}
              <strong>{mismatchConfirm?.productFinish}</strong>. Assign anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (mismatchConfirm) {
                  onSelect(mismatchConfirm.externalId);
                  setMismatchConfirm(null);
                }
              }}
            >
              Assign anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
