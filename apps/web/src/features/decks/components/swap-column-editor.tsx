import type { HoverHandler } from "@/features/cards/lib/card-row-interactions";
import { CardChip, CardPicker } from "@/features/decks/components/deck-card-picker";
import type { PlanSwapDraft, SwapDirection } from "@/features/decks/lib/deck-plan";
import { useNumericDraft } from "@/hooks/use-numeric-draft";

interface SwapCandidate {
  cardId: string;
  cardName: string;
  quantity?: number;
}

const DEFAULT_MAX_QUANTITY = 99;

/** An input can't style part of its own value, so the "1/3" field composes a styled container around a bare input plus suffix. */
function SwapQuantityField({
  value,
  max,
  available,
  onChange,
}: {
  value: number;
  max: number;
  available?: number;
  onChange: (raw: string) => void;
}) {
  const { inputProps } = useNumericDraft({ display: String(value), onCommit: onChange });
  return (
    <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-8 w-14 shrink-0 items-center justify-center rounded-lg border bg-transparent px-1 py-1 text-base transition-colors focus-within:ring-2 md:text-sm">
      <input
        type="number"
        min={1}
        max={max}
        className="w-5 min-w-0 bg-transparent text-right tabular-nums outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Quantity"
        {...inputProps}
      />
      {available === undefined ? null : (
        <span className="text-muted-foreground shrink-0 tabular-nums">/{available}</span>
      )}
    </div>
  );
}

interface SwapColumnsProps {
  swaps: readonly PlanSwapDraft[];
  maindeckCandidates: SwapCandidate[];
  sideboardCandidates: SwapCandidate[];
  onAdd: (direction: SwapDirection, cardId: string) => void;
  /** Both index args are positions in `swaps`, not in a filtered column. */
  onSetQuantity: (swapIndex: number, quantity: number) => void;
  onRemove: (swapIndex: number) => void;
  onHoverCard?: HoverHandler;
  /** Omit to leave a typed value above the cap uncorrected. */
  maxQuantityFor?: (cardId: string, direction: SwapDirection) => number;
}

function SwapColumn({
  direction,
  swaps,
  candidates,
  onAdd,
  onSetQuantity,
  onRemove,
  onHoverCard,
  maxQuantityFor,
}: Omit<SwapColumnsProps, "maindeckCandidates" | "sideboardCandidates"> & {
  direction: SwapDirection;
  candidates: SwapCandidate[];
}) {
  const columnSwaps = swaps
    .map((swap, swapIndex) => ({ swap, swapIndex }))
    .filter((entry) => entry.swap.direction === direction);
  const used = new Set(columnSwaps.map((entry) => entry.swap.cardId));
  const open = candidates.filter((candidate) => !used.has(candidate.cardId));
  return (
    <div className="flex-1 space-y-2">
      <div className="text-2xs font-semibold tracking-wide uppercase">
        {direction === "out" ? (
          <span className="text-destructive">− Out (maindeck)</span>
        ) : (
          <span className="text-success">+ In (sideboard)</span>
        )}
      </div>
      {columnSwaps.map(({ swap, swapIndex }) => {
        const limit = maxQuantityFor?.(swap.cardId, direction);
        // Reads the unfiltered `candidates`, not `open` — a swapped card is gone from the picker list but still needs its count here.
        const available = candidates.find(
          (candidate) => candidate.cardId === swap.cardId,
        )?.quantity;
        return (
          <div key={`${swap.cardId}-${swap.direction}`} className="flex items-center gap-1.5">
            <SwapQuantityField
              value={swap.quantity}
              max={limit ?? DEFAULT_MAX_QUANTITY}
              available={available}
              onChange={(raw) =>
                onSetQuantity(
                  swapIndex,
                  Math.min(limit ?? Number.POSITIVE_INFINITY, Math.max(1, Number(raw) || 1)),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <CardChip
                cardId={swap.cardId}
                variant="field"
                onRemove={() => onRemove(swapIndex)}
                onHoverCard={onHoverCard}
              />
            </div>
          </div>
        );
      })}
      <CardPicker
        candidates={open}
        onSelect={(cardId) => onAdd(direction, cardId)}
        placeholder={direction === "out" ? "Add a card to cut…" : "Add a card to bring in…"}
      />
    </div>
  );
}

/** Shared by the deck plan's matchup editor and the Test tab's sideboard experiment; both drive the same `PlanSwapDraft[]` shape. */
export function SwapColumns({
  swaps,
  maindeckCandidates,
  sideboardCandidates,
  onAdd,
  onSetQuantity,
  onRemove,
  onHoverCard,
  maxQuantityFor,
}: SwapColumnsProps) {
  const shared = {
    swaps,
    onAdd,
    onSetQuantity,
    onRemove,
    ...(onHoverCard && { onHoverCard }),
    ...(maxQuantityFor && { maxQuantityFor }),
  };
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <SwapColumn direction="out" candidates={maindeckCandidates} {...shared} />
      <SwapColumn direction="in" candidates={sideboardCandidates} {...shared} />
    </div>
  );
}
