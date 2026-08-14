import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { TIER_TILE_WIDTHS, useDisplayStore } from "@/stores/display-store";

/**
 * Minus / size / plus control for the tier board's card size, the board's
 * counterpart to the card browser's column control. It steps a fixed ladder
 * (see {@link TIER_TILE_WIDTHS}) rather than taking a free number, because the
 * rows size themselves off the tile and an arbitrary width would land on a row
 * height that reads as a mistake.
 *
 * @returns The card-size button group.
 */
export function TierTileSizeControls() {
  const step = useDisplayStore((state) => state.tierTileStep);
  const setStep = useDisplayStore((state) => state.setTierTileStep);
  const last = TIER_TILE_WIDTHS.length - 1;

  return (
    <ButtonGroup aria-label="Card size">
      <Button
        variant="outline"
        size="sm"
        className="size-7 p-0"
        onClick={() => setStep(step - 1)}
        disabled={step <= 0}
        aria-label="Smaller cards"
      >
        <MinusIcon />
      </Button>
      <ButtonGroupText className="flex min-w-7 items-center justify-center text-xs tabular-nums">
        {step + 1}
      </ButtonGroupText>
      <Button
        variant="outline"
        size="sm"
        className="size-7 p-0"
        onClick={() => setStep(step + 1)}
        disabled={step >= last}
        aria-label="Larger cards"
      >
        <PlusIcon />
      </Button>
    </ButtonGroup>
  );
}
