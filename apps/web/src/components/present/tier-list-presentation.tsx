import type { TierRow } from "@openrift/shared";

import { CardStageMain } from "@/components/present/card-stage-main";
import { PresentationStage } from "@/components/present/presentation-stage";
import { StageRankBadge } from "@/components/present/stage-rank-badge";
import { TierStageMain } from "@/components/present/tier-stage-main";
import { resolveTierRows } from "@/components/tier-lists/tier-board";
import { useCards } from "@/hooks/use-cards";
import { usePublicTierList, useTierList } from "@/hooks/use-tier-lists";
import { tierRowsToQueue } from "@/lib/tier-list-presentation";
import { usePresentationStore } from "@/stores/presentation-store";

interface TierPresentationProps {
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}

/**
 * Presents one of the signed-in creator's own tier lists.
 *
 * Kept apart from the share-token variant rather than branching inside one
 * component: the two resolve their list through different queries, and one
 * conditional hook chain over both is exactly the shape React forbids.
 *
 * @returns The stage, driven by the list's board.
 */
export function OwnedTierListPresentation({
  tierListId,
  ...rest
}: TierPresentationProps & { tierListId: string }) {
  const { data } = useTierList(tierListId);
  return <TierBoardPresentation title={data.title} tiers={data.tiers} {...rest} />;
}

/**
 * Presents a publicly shared tier list, so a co-streamer can run someone else's
 * ranking without owning it.
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
 * The shared half: resolve the saved board against the catalogue, flatten it
 * into a queue, and hand the stage whichever layout is switched on.
 *
 * Both layouts walk the *same* queue, so `B` swaps the shape of the show without
 * losing the creator's place in it.
 *
 * @returns The stage node.
 */
function TierBoardPresentation({
  title,
  tiers,
  index,
  onIndexChange,
  onExit,
}: TierPresentationProps & { title: string; tiers: readonly TierRow[] }) {
  const { cardsById, printingsByCardId } = useCards();
  const boardMode = usePresentationStore((state) => state.boardMode);
  const showRank = usePresentationStore((state) => state.showRank);
  const direction = usePresentationStore((state) => state.direction);

  const rows = resolveTierRows(tiers, cardsById, printingsByCardId);
  const queue = tierRowsToQueue(rows, direction);

  // The card layout has no board to read the ranking off, so the badge is the
  // whole answer to "where did this one land". The board layout builds its own,
  // beside the hero card rather than beside the ladder.
  const stop = queue[index];
  const rankBadge =
    showRank && stop?.contextLabel ? (
      <StageRankBadge
        label={stop.contextLabel}
        rowIndex={stop.rowIndex}
        unranked={rows[stop.rowIndex]?.unranked}
      />
    ) : null;

  return (
    <PresentationStage
      items={queue}
      index={index}
      onIndexChange={onIndexChange}
      onExit={onExit}
      title={title}
      boardControls
    >
      {boardMode ? (
        <TierStageMain rows={rows} queue={queue} index={index} onIndexChange={onIndexChange} />
      ) : (
        <CardStageMain items={queue} index={index} badge={rankBadge} />
      )}
    </PresentationStage>
  );
}
