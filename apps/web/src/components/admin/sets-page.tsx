import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";

import { CountBadge } from "@/components/admin/count-badge";
import { ActionCard, refreshActions, useCronStatus } from "@/components/admin/refresh-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCreateSet, useReorderSets, useSets, useUpdateSet } from "@/hooks/use-sets";

interface EditingRow {
  id: string;
  name: string;
  printedTotal: string;
}

export function SetsPage() {
  const { data, isLoading, error } = useSets();
  const { data: cronStatus } = useCronStatus();
  const updateMutation = useUpdateSet();
  const createMutation = useCreateSet();
  const reorderMutation = useReorderSets();
  const [editing, setEditing] = useState<EditingRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [newSet, setNewSet] = useState({ id: "", name: "", printedTotal: "" });
  const [createError, setCreateError] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">Failed to load: {error.message}</p>;
  }

  if (!data) {
    return null;
  }

  const { sets } = data;

  function startEditing(set: { id: string; name: string; printedTotal: number }) {
    setEditing({ id: set.id, name: set.name, printedTotal: String(set.printedTotal) });
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
      { id: editing.id, name: editing.name, printedTotal },
      { onSuccess: () => setEditing(null) },
    );
  }

  function handleCreate() {
    setCreateError("");
    const printedTotal = parseInt(newSet.printedTotal, 10);
    if (!newSet.id.trim() || !newSet.name.trim()) {
      setCreateError("ID and name are required");
      return;
    }
    if (isNaN(printedTotal) || printedTotal < 0) {
      setCreateError("Printed total must be a non-negative number");
      return;
    }
    createMutation.mutate(
      { id: newSet.id.trim(), name: newSet.name.trim(), printedTotal },
      {
        onSuccess: () => {
          setAdding(false);
          setNewSet({ id: "", name: "", printedTotal: "" });
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
    const reordered = sets.map((s) => s.id);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <div className="space-y-4">
      <ActionCard action={refreshActions.catalog} cronStatus={cronStatus} />
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
                        setNewSet({ id: "", name: "", printedTotal: "" });
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
                <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                  No sets yet.
                </TableCell>
              </TableRow>
            )}
            {sets.map((set, index) =>
              editing?.id === set.id ? (
                <TableRow key={set.id}>
                  <TableCell className="text-muted-foreground text-center">{index + 1}</TableCell>
                  <TableCell className="font-mono">{set.id}</TableCell>
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
                <TableRow key={set.id}>
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
                  <TableCell className="font-mono">{set.id}</TableCell>
                  <TableCell>{set.name}</TableCell>
                  <TableCell className="text-right">{set.printedTotal}</TableCell>
                  <TableCell className="text-right">
                    <CountBadge count={set.cardCount} />
                  </TableCell>
                  <TableCell className="text-right">
                    <CountBadge count={set.printingCount} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => startEditing(set)}>
                      Edit
                    </Button>
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
