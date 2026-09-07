import type { TierRow } from "@openrift/shared/types/api/tier-list";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { useCards } from "@/features/cards/hooks/use-cards";
import { CardStageMain } from "@/features/stage/components/card-stage-main";
import type { StageEditControls } from "@/features/stage/components/presentation-stage";
import { PresentationStage } from "@/features/stage/components/presentation-stage";
import { StageRankBadge } from "@/features/stage/components/stage-rank-badge";
import { useChromaPlate } from "@/features/stage/components/stage-shell";
import { TierBoardEditor } from "@/features/stage/components/tier-board-editor";
import { TierListDndContext } from "@/features/stage/components/tier-list-dnd-context";
import { TierStageMain } from "@/features/stage/components/tier-stage-main";
import { useTierListAutosave } from "@/features/stage/hooks/use-tier-list-autosave";
import { usePublicTierList, useTierList } from "@/features/stage/hooks/use-tier-lists";
import { clampIndex } from "@/features/stage/lib/presentation-queue";
import {
  boardRevealCount,
  resolveTierRows,
  tierRowsToQueue,
} from "@/features/stage/lib/tier-list-presentation";
import { usePresentationStore } from "@/features/stage/stores/presentation-store";
import { useTierListBuilderStore } from "@/features/stage/stores/tier-list-builder-store";
import { cn } from "@/lib/utils";

interface TierPresentationProps {
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}

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
  // Declared before the effects below: cleanups run in declaration order, and
  // the autosave flush must fire before the reset drops the draft.
  const autosave = useTierListAutosave(tierListId);

  // Keyed on id, not the response object: a background refetch must not
  // discard ranking that is still mid-air.
  useEffect(() => {
    if (loadedListId !== tierListId) {
      useTierListBuilderStore.getState().load(tierListId, data.tiers);
    }
  }, [tierListId, data.tiers, loadedListId]);

  useEffect(() => useTierListBuilderStore.getState().reset, []);

  const adopted = loadedListId === tierListId;

  return (
    <TierBoardPresentation
      title={data.title}
      tiers={adopted ? draftRows : data.tiers}
      // Withheld until load has run: mounting the editor over an empty store
      // would render a board with no rows for one frame.
      editSurface={adopted ? <TierStageEditor /> : null}
      edit={{
        editing,
        onToggle: () => onEditingChange(!editing),
        status: autosave.saving ? "Saving…" : "Saved",
      }}
      {...rest}
      onExit={() => {
        autosave.flush();
        rest.onExit();
      }}
    />
  );
}

function TierStageEditor() {
  const { cardsById, printingsByCardId } = useCards();
  const plate = useChromaPlate();

  return (
    <TierListDndContext cardsById={cardsById} printingsByCardId={printingsByCardId}>
      <div className="-mx-1 flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-y-auto px-1 py-[3vh]">
        <div className={cn("w-full max-w-5xl", plate)}>
          <TierBoardEditor
            cardsById={cardsById}
            printingsByCardId={printingsByCardId}
            tapToAssign={false}
          />
        </div>
      </div>
    </TierListDndContext>
  );
}

export function SharedTierListPresentation({
  token,
  ...rest
}: TierPresentationProps & { token: string }) {
  const { data } = usePublicTierList(token);
  return (
    <TierBoardPresentation
      title={`${data.tierList.title} · ${data.owner.displayName}`}
      boardTitle={data.tierList.title}
      tiers={data.tierList.tiers}
      {...rest}
    />
  );
}

function TierBoardPresentation({
  title,
  boardTitle,
  tiers,
  index,
  onIndexChange,
  onExit,
  edit,
  editSurface,
}: TierPresentationProps & {
  title: string;
  boardTitle?: string;
  tiers: readonly TierRow[];
  edit?: StageEditControls;
  editSurface?: ReactNode;
}) {
  const { cardsById, printingsByCardId } = useCards();
  const boardMode = usePresentationStore((state) => state.boardMode);
  const showRank = usePresentationStore((state) => state.showRank);
  const reveal = usePresentationStore((state) => state.reveal);
  const direction = usePresentationStore((state) => state.direction);

  const rows = resolveTierRows(tiers, cardsById, printingsByCardId);
  const queue = tierRowsToQueue(rows, direction);
  // The board can shrink after edits, so `index` may point past the end;
  // clamp for the render only.
  const stopIndex = clampIndex(index, queue.length);

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
      exitLabel="Back to the tier list"
      title={title}
      boardControls
      obsBoard={{
        title: boardTitle ?? title,
        tiers,
        direction,
        revealCount: boardRevealCount({ reveal, index: stopIndex, total: queue.length }),
      }}
      edit={edit}
    >
      {main}
    </PresentationStage>
  );
}
