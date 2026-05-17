import { HandshakeIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useAddCopiesToTradeList,
  useCreateTradeList,
  useTradeLists,
} from "@/hooks/use-trade-lists";

// Mirrors the API cap in bulkCreateTradeListItemsSchema. Keep in sync if changed.
const MAX_BULK_ADD = 500;

interface AddToTradeListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyIds: string[];
  onAdded?: () => void;
}

export function AddToTradeListDialog({
  open,
  onOpenChange,
  copyIds,
  onAdded,
}: AddToTradeListDialogProps) {
  const { data: tradeLists } = useTradeLists();
  const addCopies = useAddCopiesToTradeList();
  const createTradeList = useCreateTradeList();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const count = copyIds.length;
  const exceedsLimit = count > MAX_BULK_ADD;

  const addToList = (tradeListId: string, listName: string) => {
    addCopies.mutate(
      { tradeListId, copyIds },
      {
        onSuccess: (result) => {
          if (result.added === 0) {
            toast.info(`Already on "${listName}"`);
          } else if (result.skipped > 0) {
            toast.success(
              `Added ${result.added} to "${listName}" (${result.skipped} already there)`,
            );
          } else {
            toast.success(`Added ${result.added} to "${listName}"`);
          }
          onAdded?.();
          onOpenChange(false);
        },
      },
    );
  };

  const handleCreateAndAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    createTradeList.mutate(
      { name: trimmed },
      {
        onSuccess: (newList) => {
          addToList(newList.id, newList.name);
          setNewName("");
          setIsCreating(false);
        },
      },
    );
  };

  const isPending = addCopies.isPending || createTradeList.isPending;
  const disableAdd = isPending || exceedsLimit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to trade list</DialogTitle>
          <DialogDescription>
            {count === 1
              ? "Choose a trade list to mark this copy as available for trade."
              : `Choose a trade list to mark these ${count} copies as available for trade.`}
          </DialogDescription>
        </DialogHeader>
        {exceedsLimit && (
          <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            You can add at most {MAX_BULK_ADD} copies at a time. Deselect {count - MAX_BULK_ADD}{" "}
            {count - MAX_BULK_ADD === 1 ? "copy" : "copies"} and try again.
          </p>
        )}
        <div className="max-h-60 overflow-y-auto">
          {tradeLists.length === 0 && !isCreating && (
            <p className="text-muted-foreground py-4 text-center text-sm">No trade lists yet.</p>
          )}
          {tradeLists.map((list) => (
            <button
              key={list.id}
              type="button"
              className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors"
              onClick={() => addToList(list.id, list.name)}
              disabled={disableAdd}
            >
              <HandshakeIcon className="size-4 shrink-0" />
              <span className="truncate">{list.name}</span>
            </button>
          ))}
        </div>
        {isCreating ? (
          <form
            className="flex items-center gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateAndAdd();
            }}
          >
            <Input
              autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional inside dialog
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Trade list name"
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={!newName.trim() || disableAdd}>
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCreating(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground justify-start"
            onClick={() => setIsCreating(true)}
            disabled={disableAdd}
          >
            <PlusIcon className="size-3.5" />
            New trade list
          </Button>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
