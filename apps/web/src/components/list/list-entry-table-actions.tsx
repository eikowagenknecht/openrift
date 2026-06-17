import { MinusIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type ListEntryTableActionsProps = {
  /** Disables the destructive action while its mutation is in flight. */
  isRemovePending: boolean;
} & (
  | {
      /**
       * Copy-kind tradelists: a single "Take off list" button that opens the
       * keep-vs-sold chooser (each row maps to a physical copy, so removal has
       * two outcomes — kept or sold).
       */
      showQuantity: false;
      onTakeOff: () => void;
    }
  | {
      /** Card/printing-kind lists: a quantity stepper plus a plain remove. */
      showQuantity: true;
      quantity: number;
      onIncrement: () => void;
      onDecrement: () => void;
      onRemove: () => void;
      isQuantityPending: boolean;
    }
);

/**
 * Per-row actions for the list-page table view. Card/printing-kind lists get a
 * quantity stepper plus a remove button; at quantity 1 the minus removes the
 * entry (firing `onRemove`) instead of stepping to 0. Copy-kind tradelists get
 * a single "Take off list" button (a copy is one physical card, so there's no
 * stepper) that opens the keep-vs-sold chooser.
 * @returns The actions cell content.
 */
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
