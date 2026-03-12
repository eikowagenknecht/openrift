import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";

import { ExpandedDetail } from "./expanded-detail";
import type { AssignableCard, MappingGroup, SourceMappingConfig } from "./price-mappings-types";
import { computeSuggestions, STRONG_MATCH_THRESHOLD } from "./suggest-mapping";

export function CardGroupRow({
  config,
  group,
  isExpanded,
  isHotkeyTarget,
  onToggle,
  onMap,
  isSaving,
  onUnmap,
  isUnmapping,
  onBatchAccept,
  onIgnore,
  isIgnoring,
  onUnassign,
  isUnassigning,
  allCards,
  onAssignToCard,
  isAssigning,
}: {
  config: SourceMappingConfig;
  group: MappingGroup;
  isExpanded: boolean;
  isHotkeyTarget: boolean;
  onToggle: () => void;
  onMap: (printingId: string, externalId: number, cardId: string) => void;
  isSaving: boolean;
  onUnmap: (printingId: string) => void;
  isUnmapping: boolean;
  onBatchAccept: () => void;
  onIgnore: (externalId: number, finish: string) => void;
  isIgnoring: boolean;
  onUnassign: (externalId: number, finish: string) => void;
  isUnassigning: boolean;
  allCards: AssignableCard[];
  onAssignToCard: (externalId: number, finish: string, cardId: string) => void;
  isAssigning: boolean;
}) {
  const unmappedCount = group.printings.filter((p) => p.externalId === null).length;
  const suggestions = computeSuggestions(group);
  const suggestionCount = suggestions.size;

  const handleMapForCard = (printingId: string, externalId: number) => {
    onMap(printingId, externalId, group.cardId);
  };

  return (
    <>
      <TableRow
        className="cursor-pointer scroll-mt-14"
        data-card-id={group.cardId}
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          {group.cardName}
          <span className="text-muted-foreground font-normal ml-2">
            (
            {[...new Set(group.printings.map((p) => p.sourceId))]
              .toSorted((a, b) => a.localeCompare(b))
              .join(", ")}
            )
          </span>
        </TableCell>
        <TableCell className="text-center">{group.printings.length}</TableCell>
        <TableCell className="text-center">{group.stagedProducts.length}</TableCell>
        <TableCell className="text-center">
          {(() => {
            if (unmappedCount === 0) {
              return (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-3" />
                  Completely mapped
                </Badge>
              );
            }
            if (suggestionCount >= unmappedCount) {
              const allStrong = [...suggestions.values()].every(
                (s) => s.score >= STRONG_MATCH_THRESHOLD,
              );
              return allStrong ? (
                <Badge className="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400">
                  <WandSparklesIcon className="size-3" />
                  Auto mappable
                </Badge>
              ) : (
                <Badge className="border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                  <WandSparklesIcon className="size-3" />
                  Review suggestions
                </Badge>
              );
            }
            return (
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <WrenchIcon className="size-3" />
                Needs manual work
              </Badge>
            );
          })()}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="p-0">
            <ExpandedDetail
              config={config}
              group={group}
              onMap={handleMapForCard}
              isSaving={isSaving}
              onUnmap={onUnmap}
              isUnmapping={isUnmapping}
              onBatchAccept={onBatchAccept}
              showHotkeyHint={isHotkeyTarget}
              onIgnore={onIgnore}
              isIgnoring={isIgnoring}
              onUnassign={onUnassign}
              isUnassigning={isUnassigning}
              allCards={allCards}
              onAssignToCard={onAssignToCard}
              isAssigning={isAssigning}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
