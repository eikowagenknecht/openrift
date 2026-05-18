import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ListEntryTableActionsProps = {
  onRemove: () => void;
  isRemovePending: boolean;
} & (
  | {
      /** When omitted (copy-kind lists), the row shows only the trash button. */
      showQuantity: false;
    }
  | {
      showQuantity: true;
      quantity: number;
      onIncrement: () => void;
      onDecrement: () => void;
      isQuantityPending: boolean;
    }
);

/**
 * Per-row Remove + (optional) quantity stepper for the list-page table view.
 * The minus button is disabled at quantity 1 — users decrement-then-remove
 * explicitly via the trash icon rather than having the stepper silently
 * delete the entry. Copy-kind lists pass `showQuantity={false}` to render the
 * trash button alone (a copy is always a single physical card).
 * @returns The actions cell content.
 */
export function ListEntryTableActions(props: ListEntryTableActionsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {props.showQuantity && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              props.onDecrement();
            }}
            disabled={props.isQuantityPending || props.quantity <= 1}
            aria-label="Decrease quantity"
          >
            <MinusIcon className="size-3.5" />
          </Button>
          <span
            className="text-foreground min-w-5 text-center text-xs font-semibold tabular-nums"
            aria-label={`Quantity ${props.quantity}`}
          >
            {props.quantity}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              props.onIncrement();
            }}
            disabled={props.isQuantityPending}
            aria-label="Increase quantity"
          >
            <PlusIcon className="size-3.5" />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          props.onRemove();
        }}
        disabled={props.isRemovePending}
        aria-label="Remove from list"
      >
        <Trash2Icon className="size-3.5" />
      </Button>
    </div>
  );
}
