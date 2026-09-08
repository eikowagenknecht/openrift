import type { ListKind } from "@openrift/shared/types/api/list";
import { legendDisplayName } from "@openrift/shared/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";

import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { useCards } from "@/features/cards/hooks/use-cards";
import { copiesQueryOptions } from "@/features/collections/lib/copies-query";
import { useRuleEditorStore } from "@/features/rules/stores/rule-editor-store";
import { useRequiredUserId } from "@/lib/auth-session";

function ExclusionChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm">
      {label}
      <ChipRemoveButton
        aria-label={`Stop excluding ${label}`}
        className="hover:bg-background/60 ml-0 p-0.5"
        onClick={onRemove}
      >
        <XIcon className="size-3.5" aria-hidden />
      </ChipRemoveButton>
    </span>
  );
}

export function RuleExclusions({
  index,
  kind,
  isCopy,
  excludeIds,
  excludeCopyIds,
}: {
  index: number;
  kind: ListKind;
  isCopy: boolean;
  excludeIds: string[];
  excludeCopyIds: string[];
}) {
  const { printingsById, printingsByCardId } = useCards();
  const toggleExcludeId = useRuleEditorStore((state) => state.toggleExcludeId);

  if (isCopy) {
    if (excludeCopyIds.length === 0) {
      return null;
    }
    return <CopyExclusions index={index} copyIds={excludeCopyIds} />;
  }

  if (excludeIds.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">Excluded</span>
      <div className="flex flex-wrap gap-1.5">
        {excludeIds.map((id) => {
          const card =
            kind === "card" ? printingsByCardId.get(id)?.[0]?.card : printingsById[id]?.card;
          const label = card ? legendDisplayName(card) : "Removed card";
          return (
            <ExclusionChip key={id} label={label} onRemove={() => toggleExcludeId(index, id)} />
          );
        })}
      </div>
    </div>
  );
}

function CopyExclusions({ index, copyIds }: { index: number; copyIds: string[] }) {
  const userId = useRequiredUserId();
  const { data: copies } = useSuspenseQuery(copiesQueryOptions(userId));
  const { printingsById } = useCards();
  const toggleExcludeCopyId = useRuleEditorStore((state) => state.toggleExcludeCopyId);

  const printingIdByCopyId = new Map(copies.map((copy) => [copy.id, copy.printingId]));

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-sm">Excluded</span>
      <div className="flex flex-wrap gap-1.5">
        {copyIds.map((copyId) => {
          const printingId = printingIdByCopyId.get(copyId);
          const card = printingId ? printingsById[printingId]?.card : undefined;
          const label = card ? legendDisplayName(card) : "Removed copy";
          return (
            <ExclusionChip
              key={copyId}
              label={label}
              onRemove={() => toggleExcludeCopyId(index, copyId)}
            />
          );
        })}
      </div>
    </div>
  );
}
