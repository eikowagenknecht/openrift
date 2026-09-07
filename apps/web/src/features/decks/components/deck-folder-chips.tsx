import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const VISIBLE_CHIPS = 2;

/** Folder ids with no label are dropped, not shown raw. */
export function DeckFolderChips({
  folderIds,
  folderLabels,
  className,
}: {
  folderIds: string[];
  folderLabels: Record<string, string>;
  className?: string;
}) {
  const names = folderIds
    .map((id) => folderLabels[id])
    .filter((name): name is string => name !== undefined);
  if (names.length === 0) {
    return null;
  }
  const shown = names.slice(0, VISIBLE_CHIPS);
  const hidden = names.slice(VISIBLE_CHIPS);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((name) => (
        <Badge key={name} variant="muted" className="max-w-full">
          <span className="truncate">{name}</span>
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={<Badge variant="muted" />}>+{hidden.length}</TooltipTrigger>
          <TooltipContent>{hidden.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
