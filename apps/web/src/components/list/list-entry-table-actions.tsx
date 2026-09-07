import { MinusIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ListEntryTableActionsProps = {
  isRemovePending: boolean;
} & (
  | {
      showQuantity: false;
      onTakeOff: () => void;
    }
  | {
      showQuantity: true;
      quantity: number;
      onIncrement: () => void;
      onDecrement: () => void;
      onRemove: () => void;
      isQuantityPending: boolean;
    }
);

export function ListEntryTableActions(props: ListEntryTableActionsProps) {
  if (!props.showQuantity) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={(event) => {
          event.stopPropagation();
          props.onTakeOff();
        }}
        disabled={props.isRemovePending}
        aria-label="Take off list"
      >
        <XIcon className="size-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(event) => {
          event.stopPropagation();
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
