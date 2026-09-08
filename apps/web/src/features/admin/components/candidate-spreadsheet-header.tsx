import { CheckIcon, EllipsisVerticalIcon, MessageSquareTextIcon, XIcon } from "lucide-react";
import { cloneElement } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CandidateSpreadsheetRow } from "@/features/admin/lib/candidate-rows";
import {
  getProviderLabel,
  isChecked,
  isFavoriteProvider,
} from "@/features/admin/lib/candidate-rows";
import type { SourceSubmitter } from "@/features/admin/lib/candidate-submitter";
import { submitterLabel } from "@/features/admin/lib/candidate-submitter";
import { cn } from "@/lib/utils";

function SubmitterLine({ submitter }: { submitter: SourceSubmitter }) {
  const label = submitterLabel(submitter);
  return (
    <div className="text-muted-foreground flex items-center gap-1 font-normal">
      <span className="min-w-0 truncate" title={label}>
        by {label}
      </span>
      {submitter.note !== null && (
        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon" className="size-5 shrink-0" />}
            aria-label="Show submission note"
          >
            <MessageSquareTextIcon className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <p className="text-muted-foreground mb-1 font-medium">Submission note</p>
            <p className="whitespace-pre-wrap">{submitter.note}</p>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function CandidateSpreadsheetHeader<TRow extends CandidateSpreadsheetRow>({
  sortedRows,
  providerLabels,
  providerNames,
  submitters,
  favoriteProviders,
  onCheck,
  onUncheck,
  columnActions,
  columnClassName,
  activeColumnBadge,
}: {
  sortedRows: TRow[];
  providerLabels?: Record<string, string>;
  providerNames?: Record<string, string>;
  submitters?: Record<string, SourceSubmitter>;
  favoriteProviders: Set<string>;
  onCheck?: (candidateId: string) => void;
  onUncheck?: (candidateId: string) => void;
  columnActions?: React.ReactElement<{ row?: NoInfer<TRow> }>;
  columnClassName?: (row: NoInfer<TRow>) => string | undefined;
  activeColumnBadge?: React.ReactNode;
}) {
  return (
    <thead>
      <tr className="bg-muted/50 border-b">
        <th className="bg-muted/50 sticky left-0 z-10 w-[150px] px-3 py-2 text-left font-medium">
          Field
        </th>
        <th className="w-[300px] border-l px-3 py-2 text-left font-medium">
          <span className="inline-flex items-center gap-1.5">
            Active
            {activeColumnBadge}
          </span>
        </th>
        {sortedRows.map((row) => {
          // A printing row inherits attribution from its parent candidate card.
          const parentCardId = row.candidateCardId;
          const submitter = submitters?.[parentCardId ?? row.id];
          return (
            <th
              key={row.id}
              className={cn(
                "w-[300px] border-l px-3 py-2 text-left font-medium",
                isFavoriteProvider(row, providerLabels, favoriteProviders) && "bg-info-soft",
                isChecked(row) && "opacity-50",
                columnClassName?.(row),
              )}
            >
              <div className="flex items-center gap-1">
                <span className="min-w-0 break-words">
                  {getProviderLabel(row, providerLabels)}
                  {parentCardId !== undefined && providerNames?.[parentCardId] && (
                    <span className="text-muted-foreground ml-1">
                      ({providerNames[parentCardId]})
                    </span>
                  )}
                </span>
                {isChecked(row) && <CheckIcon className="text-success size-3.5 shrink-0" />}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon" className="ml-auto shrink-0" />}
                  >
                    <EllipsisVerticalIcon className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onCheck && !isChecked(row) && (
                      <DropdownMenuItem onClick={() => onCheck(row.id)}>
                        <CheckIcon className="mr-2 size-3.5" />
                        Mark as checked
                      </DropdownMenuItem>
                    )}
                    {onUncheck && isChecked(row) && (
                      <DropdownMenuItem onClick={() => onUncheck(row.id)}>
                        <XIcon className="mr-2 size-3.5" />
                        Mark as unchecked
                      </DropdownMenuItem>
                    )}
                    {columnActions ? cloneElement(columnActions, { row }) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {submitter && <SubmitterLine submitter={submitter} />}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
