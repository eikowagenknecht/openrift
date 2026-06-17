import { MinusIcon, PlusIcon, XIcon } from "lucide-react";

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
 * At quantity 1 the minus button removes the entry (firing `onRemove`) instead
 * of decrementing to 0, so the last copy can be cleared without reaching for
 * the trash icon. Copy-kind lists pass `showQuantity={false}` to render the
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
              // At quantity 1, the minus clears the entry instead of stepping to 0.
              if (props.quantity <= 1) {
                props.onRemove();
              } else {
                props.onDecrement();
              }
            }}
            disabled={props.isQuantityPending || props.isRemovePending}
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
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
