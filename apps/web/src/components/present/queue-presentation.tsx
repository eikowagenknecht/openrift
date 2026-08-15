import { CardStageMain } from "@/components/present/card-stage-main";
import { PresentationStage } from "@/components/present/presentation-stage";
import { useCards } from "@/hooks/use-cards";
import type { PresentationItem } from "@/lib/presentation-queue";
import { resolveQueuePrintings } from "@/lib/presentation-queue";

/**
 * Presents an ad-hoc queue of printings assembled before recording.
 *
 * @returns The stage, driven by the queue's printing ids.
 */
export function QueuePresentation({
  printingIds,
  index,
  onIndexChange,
  onExit,
}: {
  printingIds: readonly string[];
  index: number;
  onIndexChange: (index: number) => void;
  onExit: () => void;
}) {
  const { printingsById } = useCards();

  // The same printing may legitimately appear twice in a queue, so the item id
  // carries its position — a bare printing id would collide and React would
  // reuse one card's DOM for both stops.
  const items: PresentationItem[] = resolveQueuePrintings(printingIds, printingsById).map(
    (printing, position) => ({ id: `${position}:${printing.id}`, printing }),
  );

  return (
    <PresentationStage
      items={items}
      index={index}
      onIndexChange={onIndexChange}
      onExit={onExit}
      exitLabel="Back to the queue"
    >
      <CardStageMain items={items} index={index} />
    </PresentationStage>
  );
}
