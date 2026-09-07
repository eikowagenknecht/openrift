import { closestCenter, DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DeckFolderResponse } from "@openrift/shared";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateDeckFolder,
  useDeckFolders,
  useRemoveDeckFolder,
  useRenameDeckFolder,
  useReorderDeckFolders,
} from "@/hooks/use-deck-folders";
import { moveToIndex } from "@/lib/move-to-index";
import { cn } from "@/lib/utils";

// The up/down buttons aren't redundant with the drag handle: they're the
// keyboard and screen-reader path to the same reorder.
function FolderRow({
  folder,
  isFirst,
  isLast,
  onMove,
}: {
  folder: DeckFolderResponse;
  isFirst: boolean;
  isLast: boolean;
  onMove: (folderId: string, direction: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const rename = useRenameDeckFolder();
  const remove = useRemoveDeckFolder();

  // Destructure before JSX: member access on this hook's return object in render makes the React Compiler bail.
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: folder.id, disabled: editing });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const commitRename = () => {
    const name = draft.trim();
    if (name === "" || name === folder.name) {
      setEditing(false);
      setDraft(folder.name);
      return;
    }
    rename.mutate(
      { id: folder.id, name },
      {
        onSuccess: () => {
          setEditing(false);
        },
        // No toast here: the global mutation error toast reports it. Keep the
        // field open with the draft so the name isn't retyped.
        onError: () => {
          setEditing(true);
        },
      },
    );
  };

  if (editing) {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Rename ${folder.name}`}
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- replaces the row's label in place, so focus must follow
          autoFocus
        />
        <Button type="button" size="sm" onClick={commitRename} disabled={rename.isPending}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(folder.name);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      {/* oxlint-disable-next-line react/forbid-elements -- dnd-kit drag activator, needs the raw ref + listeners */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Reorder ${folder.name}`}
        className={cn(
          "text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md outline-hidden",
          "cursor-grab active:cursor-grabbing",
          // Without this, the default touch-action scrolls the dialog and a
          // pointercancel aborts the drag before dnd-kit's sensor activates.
          "touch-none",
          "focus-visible:ring-ring focus-visible:ring-2",
        )}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
      <span className="text-muted-foreground shrink-0 text-sm">
        {folder.deckCount} {folder.deckCount === 1 ? "deck" : "decks"}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Move ${folder.name} up`}
        disabled={isFirst}
        onClick={() => onMove(folder.id, -1)}
      >
        <ChevronUpIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Move ${folder.name} down`}
        disabled={isLast}
        onClick={() => onMove(folder.id, 1)}
      >
        <ChevronDownIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Rename ${folder.name}`}
        onClick={() => setEditing(true)}
      >
        <PencilIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${folder.name}`}
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id: folder.id })}
      >
        <TrashIcon className="size-4" />
      </Button>
    </div>
  );
}

export function ManageDeckFoldersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: folders } = useDeckFolders();
  const create = useCreateDeckFolder();
  const reorder = useReorderDeckFolders();
  const [newName, setNewName] = useState("");

  // Without a minimum distance, a click on the grip registers as a
  // zero-length drag and swallows the focus ring.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const folderList = folders ?? [];

  const handleCreate = () => {
    const name = newName.trim();
    if (name === "") {
      return;
    }
    create.mutate(
      { name },
      {
        onSuccess: () => {
          setNewName("");
        },
      },
    );
  };

  const commitMove = (from: number, to: number) => {
    const ids = moveToIndex(
      folderList.map((folder) => folder.id),
      from,
      to,
    );
    if (ids) {
      reorder.mutate({ orderedIds: ids });
    }
  };

  const handleMove = (folderId: string, direction: -1 | 1) => {
    const index = folderList.findIndex((folder) => folder.id === folderId);
    commitMove(index, index + direction);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    commitMove(
      folderList.findIndex((folder) => folder.id === active.id),
      folderList.findIndex((folder) => folder.id === over.id),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage folders</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {folderList.length === 0 ? (
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyDescription>A deck can sit in more than one folder.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={folderList.map((folder) => folder.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-1">
                  {folderList.map((folder, index) => (
                    <FolderRow
                      key={folder.id}
                      folder={folder}
                      isFirst={index === 0}
                      isLast={index === folderList.length - 1}
                      onMove={handleMove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <DialogForm onSubmit={handleCreate}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-folder-name">New folder</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="new-folder-name"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Standard brews"
                />
                <Button type="submit" disabled={newName.trim() === "" || create.isPending}>
                  Create
                </Button>
              </div>
            </div>
          </DialogForm>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
