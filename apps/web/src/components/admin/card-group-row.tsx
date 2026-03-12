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
import { computeSuggestions } from "./suggest-mapping";

export function CardGroupRow({
  config,
  group,
  isExpanded,
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
  onAssignToCard: (externalId: number, finish: string, cardId: string, setId: string) => void;
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
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          <span className="text-muted-foreground font-normal mr-2">
            {
              group.printings.reduce((best, p) =>
                p.collectorNumber < best.collectorNumber ? p : best,
              ).sourceId
            }
          </span>
          {group.cardName}
        </TableCell>
        <TableCell className="text-center">{group.printings.length}</TableCell>
        <TableCell className="text-center">{group.stagedProducts.length}</TableCell>
        <TableCell className="text-center">
          {unmappedCount === 0 ? (
            <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2Icon className="size-3" />
              Completely mapped
            </Badge>
          ) : suggestionCount >= unmappedCount ? (
            <Badge className="border-primary/30 bg-primary/10 text-primary">
              <WandSparklesIcon className="size-3" />
              Probably auto mappable
            </Badge>
          ) : (
            <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <WrenchIcon className="size-3" />
              Needs manual work
            </Badge>
          )}
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
