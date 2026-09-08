import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { SectionHeading } from "@/components/ui/section-heading";
import { SwapColumns } from "@/features/decks/components/swap-column-editor";
import type { PlanSwapDraft, SwapDirection } from "@/features/decks/lib/deck-plan";

interface SwapCandidate {
  cardId: string;
  cardName: string;
  quantity: number;
}

interface DeckSideboardTestProps {
  swaps: PlanSwapDraft[];
  swapsActive: boolean;
  mainRows: SwapCandidate[];
  sideboardRows: SwapCandidate[];
  open: boolean;
  onToggleOpen: () => void;
  onAdd: (direction: SwapDirection, cardId: string) => void;
  onSetQuantity: (swapIndex: number, quantity: number) => void;
  onRemove: (swapIndex: number) => void;
  onReset: () => void;
  maxQuantityFor: (cardId: string, direction: SwapDirection) => number;
}

export function DeckSideboardTest({
  swaps,
  swapsActive,
  mainRows,
  sideboardRows,
  open,
  onToggleOpen,
  onAdd,
  onSetQuantity,
  onRemove,
  onReset,
  maxQuantityFor,
}: DeckSideboardTestProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <ExpandToggle expanded={open} onClick={onToggleOpen} chevronClassName="size-3.5">
          <SectionHeading as="span" size="sm">
            Sideboard test
          </SectionHeading>
        </ExpandToggle>
        {swapsActive && (
          <Button type="button" variant="ghost" size="xs" onClick={onReset} className="ml-auto">
            Reset
          </Button>
        )}
      </div>
      {/* Collapsing hides the controls only; active swaps keep shaping the odds. */}
      {open && (
        <>
          <SwapColumns
            swaps={swaps}
            maindeckCandidates={mainRows}
            sideboardCandidates={sideboardRows}
            onAdd={onAdd}
            onSetQuantity={onSetQuantity}
            onRemove={onRemove}
            maxQuantityFor={maxQuantityFor}
          />
          <p className="text-muted-foreground text-2xs mt-1.5">
            Experiment only — swaps change the odds and sample hands here, nothing is saved to the
            deck.
          </p>
        </>
      )}
    </div>
  );
}
