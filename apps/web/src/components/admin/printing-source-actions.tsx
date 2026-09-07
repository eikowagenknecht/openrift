import { BanIcon, CopyCheckIcon, CopyIcon, MoveIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

interface PrintingTarget {
  id: string;
  label: string;
}

interface PrintingSourceActionsProps {
  targets: PrintingTarget[];
  onAssign?: (printingId: string) => void;
  onCopy?: (printingId: string) => void;
  onAcceptAll?: () => void;
  onUnassign?: () => void;
  /** Omitted for card-review grant holders; triage is full-admin. */
  onIgnore?: () => void;
  /** Omitted for card-review grant holders. */
  onDelete?: () => void;
}

export function PrintingSourceActions({
  targets,
  onAssign,
  onCopy,
  onAcceptAll,
  onUnassign,
  onIgnore,
  onDelete,
}: PrintingSourceActionsProps) {
  return (
    <>
      {targets.length > 0 && onAssign && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MoveIcon className="mr-2 size-3.5" />
            Assign to…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {targets.map((p) => (
              <DropdownMenuItem key={`assign-${p.id}`} onClick={() => onAssign(p.id)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {targets.length > 0 && onCopy && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CopyIcon className="mr-2 size-3.5" />
            Copy to…
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {targets.map((p) => (
              <DropdownMenuItem key={`copy-${p.id}`} onClick={() => onCopy(p.id)}>
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {onAcceptAll && (
        <DropdownMenuItem onClick={onAcceptAll}>
          <CopyCheckIcon className="mr-2 size-3.5" />
          Accept all fields
        </DropdownMenuItem>
      )}
      {onUnassign && (
        <DropdownMenuItem onClick={onUnassign}>
          <XIcon className="mr-2 size-3.5" />
          Unassign
        </DropdownMenuItem>
      )}
      {onIgnore && (
        <DropdownMenuItem onClick={onIgnore}>
          <BanIcon className="mr-2 size-3.5" />
          Ignore permanently
        </DropdownMenuItem>
      )}
      {onDelete && (
        <DropdownMenuItem onClick={onDelete}>
          <Trash2Icon className="mr-2 size-3.5" />
          Delete
        </DropdownMenuItem>
      )}
    </>
  );
}
