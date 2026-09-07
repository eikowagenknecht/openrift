import { FolderIcon, HandshakeIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import { QuantityStepperField } from "@/components/ui/quantity-stepper";
import { useBulkAddListEntries, useCreateList, useLists } from "@/hooks/use-lists";
import { cn } from "@/lib/utils";

const MAX_BULK_ADD = 500;

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copyIds: string[];
  groupOwnedOnly?: boolean;
  singleCard?: boolean;
  onAdded?: () => void;
}

/** Adds selected copies as copy-kind entries; the user can create a list inline. */
export function AddToListDialog({
  open,
  onOpenChange,
  copyIds,
  groupOwnedOnly = false,
  singleCard = false,
  onAdded,
}: AddToListDialogProps) {
  const { data: allLists } = useLists();
  const bulkAdd = useBulkAddListEntries();
  const createList = useCreateList();

  // Group-owned copies aren't the user's to trade away, so a tradelist
  // target is dropped for them (mirrors the server's personalOnly rule).
  const eligibleLists = allLists.filter(
    (list) => list.kind === "copy" && (!groupOwnedOnly || list.intent === "organize"),
  );

  const [createIntent, setCreateIntent] = useState<"trade" | "organize" | null>(null);
  const [newName, setNewName] = useState("");
  const [highlightedId, setHighlightedId] = useState("");

  const count = copyIds.length;

  const canChooseQuantity = singleCard && count > 1;
  const [quantity, setQuantity] = useState(count);
  const [seed, setSeed] = useState({ open, count });
  if (seed.open !== open || seed.count !== count) {
    setSeed({ open, count });
    if (open) {
      setQuantity(count);
    }
  }
  const effectiveQuantity = canChooseQuantity ? quantity : count;
  const exceedsLimit = effectiveQuantity > MAX_BULK_ADD;

  const addToList = (listId: string, listName: string) => {
    bulkAdd.mutate(
      { listId, entries: copyIds.slice(0, effectiveQuantity).map((copyId) => ({ copyId })) },
      {
        onSuccess: (result) => {
          // Copy-kind adds never bump quantity (duplicates DO NOTHING), so a
          // zero `added` doesn't tell apart "already there" from "skipped".
          if (result.added > 0) {
            toast.success(
              result.skipped > 0
                ? `Added ${result.added} to "${listName}" (${result.skipped} skipped)`
                : `Added ${result.added} to "${listName}"`,
            );
          } else {
            toast.info(`Nothing added to "${listName}"`);
          }
          onAdded?.();
          onOpenChange(false);
        },
      },
    );
  };

  const handleCreateAndAdd = () => {
    if (createIntent === null) {
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    createList.mutate(
      { name: trimmed, intent: createIntent, kind: "copy" },
      {
        onSuccess: (newList) => {
          addToList(newList.id, newList.name);
          setNewName("");
          setCreateIntent(null);
        },
      },
    );
  };

  const isPending = bulkAdd.isPending || createList.isPending;
  const disableAdd = isPending || exceedsLimit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to list</DialogTitle>
        </DialogHeader>
        {canChooseQuantity && (
          <QuantityStepperField
            label="Copies to add"
            value={quantity}
            onValueChange={setQuantity}
            max={count}
            disabled={isPending}
          />
        )}
        {exceedsLimit && (
          <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
            You can add at most {MAX_BULK_ADD} copies at a time. Deselect {count - MAX_BULK_ADD}{" "}
            {count - MAX_BULK_ADD === 1 ? "copy" : "copies"} and try again.
          </p>
        )}
        <div className="max-h-60 overflow-y-auto">
          {eligibleLists.length > 0 ? (
            <PickerList highlightedId={highlightedId} onHighlightChange={setHighlightedId}>
              {eligibleLists.map((list) => {
                const Icon = list.intent === "trade" ? HandshakeIcon : FolderIcon;
                const intentLabel = list.intent === "trade" ? "Tradelist" : "Organize";
                return (
                  <PickerRow
                    key={list.id}
                    value={list.id}
                    onSelect={disableAdd ? undefined : () => addToList(list.id, list.name)}
                    className={cn("px-3 py-2", disableAdd && "pointer-events-none opacity-50")}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{list.name}</span>
                    <span className="text-muted-foreground text-2xs shrink-0">{intentLabel}</span>
                  </PickerRow>
                );
              })}
            </PickerList>
          ) : createIntent === null ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No copy lists yet. Create one below.
            </p>
          ) : null}
        </div>
        {groupOwnedOnly && (
          <p className="text-muted-foreground text-sm">
            These cards belong to a shared group collection, so they can only go on an organize
            list.
          </p>
        )}
        {createIntent === null ? (
          <div className="flex flex-wrap gap-2">
            {!groupOwnedOnly && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground justify-start"
                onClick={() => setCreateIntent("trade")}
                disabled={disableAdd}
              >
                <PlusIcon className="size-3.5" />
                New tradelist
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground justify-start"
              onClick={() => setCreateIntent("organize")}
              disabled={disableAdd}
            >
              <PlusIcon className="size-3.5" />
              New organize list
            </Button>
          </div>
        ) : (
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
              placeholder={createIntent === "trade" ? "Tradelist name" : "Organize list name"}
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
                setCreateIntent(null);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </form>
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
