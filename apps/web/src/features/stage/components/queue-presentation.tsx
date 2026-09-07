import { useCards } from "@/features/cards/hooks/use-cards";
import { CardStageMain } from "@/features/stage/components/card-stage-main";
import { PresentationStage } from "@/features/stage/components/presentation-stage";
import type { PresentationItem } from "@/features/stage/lib/presentation-queue";
import { resolveQueuePrintings } from "@/features/stage/lib/presentation-queue";

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

  // A printing may repeat in the queue; the id includes position so React keys don't collide.
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
