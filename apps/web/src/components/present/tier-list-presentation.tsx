import type { TierRow } from "@openrift/shared";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { CardStageMain } from "@/components/present/card-stage-main";
import type { StageEditControls } from "@/components/present/presentation-stage";
import { PresentationStage } from "@/components/present/presentation-stage";
import { StageRankBadge } from "@/components/present/stage-rank-badge";
import { useChromaPlate } from "@/components/present/stage-shell";
import { TierStageMain } from "@/components/present/tier-stage-main";
import { resolveTierRows } from "@/components/tier-lists/tier-board";
import { TierBoardEditor } from "@/components/tier-lists/tier-board-editor";
import { TierListDndContext } from "@/components/tier-lists/tier-list-dnd-context";
import { useCards } from "@/hooks/use-cards";
import { useTierListAutosave } from "@/hooks/use-tier-list-autosave";
import { usePublicTierList, useTierList } from "@/hooks/use-tier-lists";
import { clampIndex } from "@/lib/presentation-queue";
import { tierRowsToQueue } from "@/lib/tier-list-presentation";
import { cn } from "@/lib/utils";
import { usePresentationStore } from "@/stores/presentation-store";
import { useTierListBuilderStore } from "@/stores/tier-list-builder-store";

interface TierPresentationProps {
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}

/**
 * Presents one of the signed-in creator's own tier lists, and — because it is
 * theirs — lets them rank on the same stage rather than somewhere else.
 *
 * This is the half that owns the board. The draft in
 * {@link useTierListBuilderStore} is the single source of truth for the whole
 * session: the show reads its queue off the draft, the editor writes to it, and
 * {@link useTierListAutosave} persists it. That is what makes the edit switch
 * instant in both directions. Presenting from the *saved* board instead would
 * mean a card ranked a moment ago is missing from the show the creator just
 * switched to, because the save is debounced and the refetch is not free.
 *
 * Kept apart from the share-token variant rather than branching inside one
 * component: the two resolve their list through different queries, and one
 * conditional hook chain over both is exactly the shape React forbids.
 *
 * @returns The stage, driven by the list's board.
 */
export function OwnedTierListPresentation({
  tierListId,
  editing,
  onEditingChange,
  ...rest
}: TierPresentationProps & {
  tierListId: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const { data } = useTierList(tierListId);
  const loadedListId = useTierListBuilderStore((state) => state.listId);
  const draftRows = useTierListBuilderStore((state) => state.rows);
  // Declared before the effects below on purpose: effect cleanups run in
  // declaration order, so the autosave's flush goes out before the reset drops
  // the draft it would have sent.
  const autosave = useTierListAutosave(tierListId);

  // Adopt the saved board on mount and whenever the stage switches lists. Keyed
  // on the id rather than the response object so a background refetch — the
  // autosave's own invalidation included — can't discard ranking that is
  // mid-air.
  useEffect(() => {
    if (loadedListId !== tierListId) {
      useTierListBuilderStore.getState().load(tierListId, data.tiers);
    }
  }, [tierListId, data.tiers, loadedListId]);

  // Leaving the stage drops the draft, so the list is next opened from what the
  // server has rather than from a board left over here.
  useEffect(() => useTierListBuilderStore.getState().reset, []);

  // The saved board stands in for the one render before the load effect runs.
  const adopted = loadedListId === tierListId;

  return (
    <TierBoardPresentation
      title={data.title}
      tiers={adopted ? draftRows : data.tiers}
      // Built here rather than in the shared half because the editor writes
      // straight to the draft, and this is the component that knows the draft is
      // this list's. Withheld until the load effect has run: mounting the editor
      // over an empty store would paint a board with no rows on it, and the
      // blank black stage it falls back to for that one frame is invisible.
      editSurface={adopted ? <TierStageEditor /> : null}
      edit={{
        editing,
        onToggle: () => onEditingChange(!editing),
        status: autosave.saving ? "Saving…" : "Saved",
      }}
      {...rest}
      onExit={() => {
        // The last few drags may still be sitting in the debounce. Send them
        // before the route changes rather than trusting the unmount to catch it.
        autosave.flush();
        rest.onExit();
      }}
    />
  );
}

/**
 * The editable board, framed for the stage.
 *
 * Everything about the board is the builder's — drag behaviour, row controls,
 * printing menus included — so a ranking made on camera is the same ranking made
 * anywhere else. What the stage adds is the frame: no pool beside it, no card
 * preview following the pointer, nothing to read but the ladder filling up.
 *
 * @returns The editor surface.
 */
function TierStageEditor() {
  const { cardsById, printingsByCardId } = useCards();
  const plate = useChromaPlate();

  return (
    <TierListDndContext cardsById={cardsById} printingsByCardId={printingsByCardId}>
      {/* Centred while the ladder is short, scrolled once it outgrows the
          stage. The inner padding (pulled back by the negative margin so
          nothing shifts) gives the rows' outset ring somewhere to live: an
          overflow container clips it flush against both edges otherwise. */}
      <div className="-mx-1 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-1 py-[3vh]">
        {/* Capped like the show's board: a ladder reads as a ladder only while
            its rows wrap rather than stretching into single lines. The plate on
            a chroma ground is what keeps the rows' translucent card colour from
            keying out along with the ground behind it. */}
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
    </TierListDndContext>
  );
}

/**
 * Presents a publicly shared tier list, so a co-streamer can run someone else's
 * ranking without owning it.
 *
 * Read-only by construction: the public query has no mutation behind it, so no
 * edit switch is offered here. That is also why this variant reads its board
 * straight from the query rather than through the builder store.
 *
 * @returns The stage, driven by the shared list's board.
 */
export function SharedTierListPresentation({
  token,
  ...rest
}: TierPresentationProps & { token: string }) {
  const { data } = usePublicTierList(token);
  return (
    <TierBoardPresentation
      title={`${data.tierList.title} · ${data.owner.displayName}`}
      tiers={data.tierList.tiers}
      {...rest}
    />
  );
}

/**
 * The shared half: resolve the board against the catalogue, flatten it into a
 * queue, and hand the stage whichever layout is switched on.
 *
 * All three layouts — the two show layouts and the editor — read the *same*
 * rows, so `B` swaps the shape of the show without losing the creator's place in
 * it, and `E` swaps between showing and changing without the board underneath
 * ever differing between the two.
 *
 * @returns The stage node.
 */
function TierBoardPresentation({
  title,
  tiers,
  index,
  onIndexChange,
  onExit,
  edit,
  editSurface,
}: TierPresentationProps & {
  title: string;
  tiers: readonly TierRow[];
  edit?: StageEditControls;
  /** The editable board, supplied only by a variant that owns its draft. */
  editSurface?: ReactNode;
}) {
  const { cardsById, printingsByCardId } = useCards();
  const boardMode = usePresentationStore((state) => state.boardMode);
  const showRank = usePresentationStore((state) => state.showRank);
  const direction = usePresentationStore((state) => state.direction);

  const rows = resolveTierRows(tiers, cardsById, printingsByCardId);
  const queue = tierRowsToQueue(rows, direction);
  // The queue is re-derived from a board that the editor can shrink, so the
  // URL's `i` can point past the end by the time the show comes back up.
  // Clamped for the render rather than navigated away, so a card unranked and
  // then put back doesn't drag the creator's place around while they work.
  const stopIndex = clampIndex(index, queue.length);

  // The card layout has no board to read the ranking off, so the badge is the
  // whole answer to "where did this one land". The board layout builds its own,
  // beside the hero card rather than beside the ladder.
  const stop = queue[stopIndex];
  const rankBadge =
    showRank && stop?.contextLabel ? (
      <StageRankBadge
        label={stop.contextLabel}
        rowIndex={stop.rowIndex}
        unranked={rows[stop.rowIndex]?.unranked}
      />
    ) : null;

  let main;
  if (edit?.editing === true) {
    main = editSurface;
  } else if (boardMode) {
    main = (
      <TierStageMain rows={rows} queue={queue} index={stopIndex} onIndexChange={onIndexChange} />
    );
  } else {
    main = <CardStageMain items={queue} index={stopIndex} badge={rankBadge} />;
  }

  return (
    <PresentationStage
      items={queue}
      index={stopIndex}
      onIndexChange={onIndexChange}
      onExit={onExit}
      title={title}
      boardControls
      edit={edit}
    >
      {main}
    </PresentationStage>
  );
}
