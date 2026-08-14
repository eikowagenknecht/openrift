import { useEffect } from "react";

import { StageShell, StageTileSizeSlider, useChromaPlate } from "@/components/present/stage-shell";
import { TierBoardEditor } from "@/components/tier-lists/tier-board-editor";
import { TierListDndContext } from "@/components/tier-lists/tier-list-dnd-context";
import { useCards } from "@/hooks/use-cards";
import { useTierListAutosave } from "@/hooks/use-tier-list-autosave";
import { useTierList } from "@/hooks/use-tier-lists";
import { cn } from "@/lib/utils";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

/**
 * Ranking live: the tier-list builder's board, on the presentation stage.
 *
 * The format this exists for is a creator on camera dragging cards out of the
 * grey unranked row into tiers, so the board is the whole show — no pool beside
 * it, no card preview following the pointer, nothing to read but the ladder
 * filling up. Everything else about the board is the builder's, drag behaviour
 * and row controls included, so a ranking made on stage is the same ranking made
 * anywhere else.
 *
 * There is no Save button on a stage, so the board saves itself
 * ({@link useTierListAutosave}).
 *
 * @returns The rank-live stage.
 */
export function RankLivePresentation({
  tierListId,
  onExit,
}: {
  tierListId: string;
  onExit: () => void;
}) {
  const { data } = useTierList(tierListId);
  const { cardsById, printingsByCardId } = useCards();
  const loadedListId = useTierListBuilderStore((state) => state.listId);
  const plate = useChromaPlate();
  // Declared before the effects below on purpose: effect cleanups run in
  // declaration order, so the autosave's flush goes out before the reset drops
  // the draft it would have sent.
  const autosave = useTierListAutosave(tierListId);

  // Adopt the saved board on mount and whenever the stage switches lists. Keyed
  // on the id rather than the response object so a background refetch of an
  // unchanged list can't discard ranking that is mid-air.
  useEffect(() => {
    if (loadedListId !== tierListId) {
      useTierListBuilderStore.getState().load(tierListId, data.tiers);
    }
  }, [tierListId, data.tiers, loadedListId]);

  // Leaving the stage drops the draft, so the list is next opened from what the
  // server has rather than from a board left over here.
  useEffect(() => useTierListBuilderStore.getState().reset, []);

  const handleExit = () => {
    // The last few drags may still be sitting in the debounce. Send them before
    // the route changes rather than trusting the unmount to catch it.
    autosave.flush();
    onExit();
  };

  return (
    <TierListDndContext cardsById={cardsById} printingsByCardId={printingsByCardId}>
      <StageShell
        onExit={handleExit}
        settings={<StageTileSizeSlider />}
        title={
          <>
            <div className="text-sm text-white/50">{data.title}</div>
            <div className="font-mono text-sm tracking-widest text-white/70 uppercase tabular-nums">
              {autosave.saving ? "Saving…" : "Saved"}
            </div>
          </>
        }
      >
        {/* Centred while the ladder is short, scrolled once it outgrows the
            stage. The inner padding (pulled back by the negative margin so
            nothing shifts) gives the rows' outset ring somewhere to live: an
            overflow container clips it flush against both edges otherwise. */}
        <div className="-mx-1 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-1 py-[3vh]">
          {/* Capped like the show's board: a ladder reads as a ladder only
              while its rows wrap rather than stretching into single lines. The
              plate on a chroma ground is what keeps the rows' translucent card
              colour from keying out along with the ground behind it. */}
          <div className={cn("w-full max-w-5xl", plate)}>
            <TierBoardEditor
              cardsById={cardsById}
              printingsByCardId={printingsByCardId}
              // Always dragging, phone or not: the stage exists to be recorded,
              // and a tap-through picker dialog is not the shot.
              tapToAssign={false}
            />
          </div>
        </div>
      </StageShell>
    </TierListDndContext>
  );
}
