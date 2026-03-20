import { BanIcon, CopyCheckIcon, CopyIcon, MoveIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

interface PrintingTarget {
  id: string;
  slug: string;
}

interface PrintingSourceActionsProps {
  /** Other printings this source can be assigned/moved/copied to */
  targets: PrintingTarget[];
  /** Reassign to a target printing */
  onAssign?: (printingId: string) => void;
  /** Copy data to a target printing */
  onCopy?: (printingId: string) => void;
  /** Accept all fields from this source into the active printing */
  onAcceptAll?: () => void;
  /** Remove manual assignment */
  onUnassign?: () => void;
  /** Permanently ignore this source */
  onIgnore: () => void;
  /** Delete this source */
  onDelete: () => void;
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
              <DropdownMenuItem key={`assign-${p.slug}`} onClick={() => onAssign(p.id)}>
                {p.slug}
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
              <DropdownMenuItem key={`copy-${p.slug}`} onClick={() => onCopy(p.id)}>
                {p.slug}
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
      <DropdownMenuItem onClick={onIgnore}>
        <BanIcon className="mr-2 size-3.5" />
        Ignore permanently
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onDelete}>
        <Trash2Icon className="mr-2 size-3.5" />
        Delete
      </DropdownMenuItem>
    </>
  );
}
