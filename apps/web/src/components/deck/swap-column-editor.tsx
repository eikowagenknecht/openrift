import { CardChip, CardPicker } from "@/components/deck/deck-card-picker";
import type { HoverHandler } from "@/lib/card-row-interactions";
import type { PlanSwapDraft, SwapDirection } from "@/lib/deck-plan";

/** A card offered by a column's picker. */
interface SwapCandidate {
  cardId: string;
  cardName: string;
  /** Copies in the source zone, shown as "of N" beside the quantity box. */
  quantity?: number;
}

/** The plan editor's ceiling, kept for callers that don't cap per card. */
const DEFAULT_MAX_QUANTITY = 99;

/**
 * The swapped-copies box, reading "1/3" with the available count in muted
 * grey. An input can't style part of its own value, so the field is composed:
 * a container carrying the `Input` primitive's box and focus ring (via
 * `focus-within`, which a text input triggers on click and on keyboard alike),
 * wrapping a bare input plus the suffix.
 * @returns The quantity field.
 */
function SwapQuantityField({
  value,
  max,
  available,
  onChange,
}: {
  value: number;
  /** Ceiling for the input's `max` attribute. */
  max: number;
  /** Copies in the source zone; omitted when the caller can't supply one. */
  available?: number;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="border-input dark:bg-input/30 focus-within:border-ring focus-within:ring-ring/50 flex h-8 w-14 shrink-0 items-center justify-center rounded-lg border bg-transparent px-1 py-1 text-base transition-colors focus-within:ring-2 md:text-sm">
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-5 min-w-0 bg-transparent text-right tabular-nums outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Quantity"
      />
      {available === undefined ? null : (
        <span className="text-muted-foreground shrink-0 tabular-nums">/{available}</span>
      )}
    </div>
  );
}

interface SwapColumnsProps {
  swaps: readonly PlanSwapDraft[];
  /** Offered by the "out" column. */
  maindeckCandidates: SwapCandidate[];
  /** Offered by the "in" column. */
  sideboardCandidates: SwapCandidate[];
  onAdd: (direction: SwapDirection, cardId: string) => void;
  /** Both index args are positions in `swaps`, not in a filtered column. */
  onSetQuantity: (swapIndex: number, quantity: number) => void;
  onRemove: (swapIndex: number) => void;
  onHoverCard?: HoverHandler;
  /**
   * Caps a card's quantity box. Omit to keep the plan editor's behavior: the
   * box advertises 99 but a typed value above it is left alone (the plan warns
   * about impossible counts rather than clamping them).
   */
  maxQuantityFor?: (cardId: string, direction: SwapDirection) => number;
}

/**
 * One direction's column: header, a quantity box plus card chip per swapped
 * card, and a picker over the rest of that zone.
 * @returns The column.
 */
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
  // Drop cards already in this column — re-adding them is a no-op.
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
        // The unfiltered prop, not `open` — a swapped card is gone from the
        // picker list but still needs its copy count here.
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

/**
 * The side-by-side out/in swap columns shared by the deck plan's matchup
 * editor and the Test tab's sideboard experiment. Both drive the same
 * `PlanSwapDraft[]` shape, so a matchup's swaps can be handed straight to the
 * test bench.
 * @returns Both columns, stacked on narrow widths.
 */
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
