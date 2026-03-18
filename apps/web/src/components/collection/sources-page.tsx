import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateSource, useDeleteSource, useSources, useUpdateSource } from "@/hooks/use-sources";

export function SourcesPage() {
  const { data: sources } = useSources();
  const createSource = useCreateSource();
  const updateSource = useUpdateSource();
  const deleteSource = useDeleteSource();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    createSource.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setNewName("");
          setIsCreating(false);
          toast.success("Source created");
        },
      },
    );
  };

  const handleRename = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    updateSource.mutate(
      { id, name: trimmed },
      {
        onSuccess: () => {
          setEditingId(null);
          toast.success("Source renamed");
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteId) {
      return;
    }
    deleteSource.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null);
        toast.success("Source deleted");
      },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Sources track where your cards came from (stores, trades, gifts, etc.)
        </p>
        <Button size="sm" onClick={() => setIsCreating(true)} disabled={isCreating}>
          <PlusIcon className="mr-1 size-3.5" />
          Add source
        </Button>
      </div>

      {isCreating && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <Input
            autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline create
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source name (e.g. Local Game Store)"
            className="max-w-sm"
            onBlur={() => {
              if (!newName.trim()) {
                setIsCreating(false);
              }
            }}
          />
          <Button type="submit" size="sm" disabled={createSource.isPending}>
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
      )}

      <div className="divide-y rounded-lg border">
        {sources.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sources yet. Create one to track where your cards come from.
          </p>
        )}
        {sources.map((source) => (
          <div key={source.id} className="flex items-center gap-3 px-4 py-3">
            {editingId === source.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRename(source.id);
                }}
              >
                <Input
                  autoFocus // oxlint-disable-line jsx-a11y/no-autofocus -- intentional for inline rename
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="max-w-sm"
                  onBlur={() => handleRename(source.id)}
                />
              </form>
            ) : (
              <button
                type="button"
                className="flex-1 cursor-pointer text-left text-sm"
                onClick={() => {
                  setEditingId(source.id);
                  setEditName(source.name);
                }}
              >
                {source.name}
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(source.createdAt).toLocaleDateString()}
            </span>
            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(source.id)}>
              <Trash2Icon className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete source</AlertDialogTitle>
          <AlertDialogDescription>
            This will delete the source. Cards from this source will keep their other data.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteSource.isPending}>
              {deleteSource.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
