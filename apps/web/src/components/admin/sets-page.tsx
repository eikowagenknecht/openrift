import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { CountBadge } from "@/components/admin/count-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateSet,
  useDeleteSet,
  useReorderSets,
  useSets,
  useUpdateSet,
} from "@/hooks/use-sets";

interface EditingRow {
  id: string;
  name: string;
  printedTotal: string;
  releasedAt: string;
}

export function SetsPage() {
  const { data } = useSets();
  const updateMutation = useUpdateSet();
  const createMutation = useCreateSet();
  const reorderMutation = useReorderSets();
  const deleteMutation = useDeleteSet();
  const [deleteError, setDeleteError] = useState("");
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSet, setNewSet] = useState({ id: "", name: "", printedTotal: "", releasedAt: "" });
  const [createError, setCreateError] = useState("");

  const { sets } = data;

  function startEditing(set: {
    slug: string;
    name: string;
    printedTotal: number | null;
    releasedAt: string | null;
  }) {
    setEditing({
      id: set.slug,
      name: set.name,
      printedTotal: set.printedTotal === null ? "" : String(set.printedTotal),
      releasedAt: set.releasedAt ?? "",
    });
  }

  function cancelEditing() {
    setEditing(null);
  }

  function saveEditing() {
    if (!editing) {
      return;
    }
    const printedTotal = parseInt(editing.printedTotal, 10);
    if (isNaN(printedTotal) || printedTotal < 0) {
      return;
    }
    updateMutation.mutate(
      { id: editing.id, name: editing.name, printedTotal, releasedAt: editing.releasedAt || null },
      { onSuccess: () => setEditing(null) },
    );
  }

  function handleCreate() {
    setCreateError("");
    const printedTotal = newSet.printedTotal ? parseInt(newSet.printedTotal, 10) : 0;
    if (!newSet.id.trim() || !newSet.name.trim()) {
      setCreateError("ID and name are required");
      return;
    }
    if (isNaN(printedTotal) || printedTotal < 0) {
      setCreateError("Printed total must be a non-negative number");
      return;
    }
    createMutation.mutate(
      {
        id: newSet.id.trim(),
        name: newSet.name.trim(),
        printedTotal,
        releasedAt: newSet.releasedAt || null,
      },
      {
        onSuccess: () => {
          setAdding(false);
          setNewSet({ id: "", name: "", printedTotal: "", releasedAt: "" });
        },
        onError: (err) => setCreateError(err.message),
      },
    );
  }

  function moveSet(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sets.length) {
      return;
    }
    const reordered = sets.map((s) => s.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add Set
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Order</TableHead>
              <TableHead className="w-28">ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-32 text-right">Printed Total</TableHead>
              <TableHead className="w-36">Release Date</TableHead>
              <TableHead className="w-24 text-right" title="Cards in this set">
                Cards
              </TableHead>
              <TableHead className="w-24 text-right" title="Printings in this set">
                Printings
              </TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adding && (
              <TableRow>
                <TableCell />
                <TableCell>
                  <Input
                    value={newSet.id}
                    onChange={(e) => setNewSet({ ...newSet, id: e.target.value })}
                    placeholder="ID"
                    className="h-8 w-24 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newSet.name}
                    onChange={(e) => setNewSet({ ...newSet, name: e.target.value })}
                    placeholder="Name"
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    inputMode="numeric"
                    value={newSet.printedTotal}
                    onChange={(e) => setNewSet({ ...newSet, printedTotal: e.target.value })}
                    placeholder="0"
                    className="ml-auto h-8 w-24 text-right"
                  />
                </TableCell>
                <TableCell>
                  <DatePicker
                    value={newSet.releasedAt || null}
                    onChange={(iso) => setNewSet({ ...newSet, releasedAt: iso })}
                    onClear={() => setNewSet({ ...newSet, releasedAt: "" })}
                  />
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setNewSet({ id: "", name: "", printedTotal: "", releasedAt: "" });
                        setCreateError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {createError && <p className="mt-1 text-xs text-destructive">{createError}</p>}
                </TableCell>
              </TableRow>
            )}
            {sets.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  No sets yet.
                </TableCell>
              </TableRow>
            )}
            {sets.map((set, index) =>
              editing?.id === set.slug ? (
                <TableRow key={set.slug}>
                  <TableCell className="text-muted-foreground text-center">{index + 1}</TableCell>
                  <TableCell className="font-mono">{set.slug}</TableCell>
                  <TableCell>
                    <Input
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="numeric"
                      value={editing.printedTotal}
                      onChange={(e) => setEditing({ ...editing, printedTotal: e.target.value })}
                      className="ml-auto h-8 w-24 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <DatePicker
                      value={editing.releasedAt || null}
                      onChange={(iso) => setEditing({ ...editing, releasedAt: iso })}
                      onClear={() => setEditing({ ...editing, releasedAt: "" })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <CountBadge count={set.cardCount} />
                  </TableCell>
                  <TableCell className="text-right">
                    <CountBadge count={set.printingCount} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={saveEditing}
                        disabled={updateMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={cancelEditing}>
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={set.slug}>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0 || reorderMutation.isPending}
                        onClick={() => moveSet(index, -1)}
                      >
                        <ArrowUpIcon className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === sets.length - 1 || reorderMutation.isPending}
                        onClick={() => moveSet(index, 1)}
                      >
                        <ArrowDownIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{set.slug}</TableCell>
                  <TableCell>{set.name}</TableCell>
                  <TableCell className="text-right">{set.printedTotal}</TableCell>
                  <TableCell className="text-muted-foreground">{set.releasedAt ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {set.cardCount > 0 ? (
                      <Link
                        to="/admin/cards"
                        search={{ set: set.slug }}
                        className="hover:opacity-70"
                      >
                        <CountBadge count={set.cardCount} />
                      </Link>
                    ) : (
                      <CountBadge count={0} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {set.printingCount > 0 ? (
                      <Link
                        to="/admin/cards"
                        search={{ set: set.slug }}
                        className="hover:opacity-70"
                      >
                        <CountBadge count={set.printingCount} />
                      </Link>
                    ) : (
                      <CountBadge count={0} />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEditing(set)}>
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                            />
                          }
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete set &ldquo;{set.slug}&rdquo;?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the set <strong>{set.name}</strong>. Sets
                              with printings cannot be deleted — remove their printings first.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeleteError("")}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogPrimitive.Close
                              render={<Button variant="destructive" />}
                              onClick={() => {
                                setDeleteError("");
                                deleteMutation.mutate(set.slug, {
                                  onError: (err) => setDeleteError(err.message),
                                });
                              }}
                            >
                              Delete
                            </AlertDialogPrimitive.Close>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
