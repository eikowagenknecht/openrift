import { useState } from "react";

import { Button } from "@/components/ui/button";
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
  useCreatePromoType,
  useDeletePromoType,
  usePromoTypes,
  useUpdatePromoType,
} from "@/hooks/use-promo-types";

export function PromoTypesPage() {
  const { data } = usePromoTypes();
  const createMutation = useCreatePromoType();
  const updateMutation = useUpdatePromoType();
  const deleteMutation = useDeletePromoType();
  const { promoTypes } = data;

  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState({ slug: "", label: "", sortOrder: "0" });
  const [createError, setCreateError] = useState("");

  function handleCreate() {
    setCreateError("");
    const slug = newType.slug.trim();
    const label = newType.label.trim();
    if (!slug || !label) {
      setCreateError("Slug and label are required");
      return;
    }
    if (!/^[a-z][a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      setCreateError("Slug must be kebab-case (e.g. nexus-night)");
      return;
    }
    createMutation.mutate(
      { slug, label, sortOrder: Number.parseInt(newType.sortOrder, 10) || 0 },
      {
        onSuccess: () => {
          setAdding(false);
          setNewType({ slug: "", label: "", sortOrder: "0" });
        },
        onError: (err) => setCreateError(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Promo types classify promotional printings (e.g. Summoner Skirmish, Nexus Night).
        </p>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add Promo Type
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-24 text-center">Sort Order</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adding && (
              <TableRow>
                <TableCell>
                  <Input
                    value={newType.slug}
                    onChange={(e) => setNewType({ ...newType, slug: e.target.value.toLowerCase() })}
                    placeholder="nexus-night"
                    className="h-8 w-48 font-mono"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newType.label}
                    onChange={(e) => setNewType({ ...newType, label: e.target.value })}
                    placeholder="Nexus Night"
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    value={newType.sortOrder}
                    onChange={(e) => setNewType({ ...newType, sortOrder: e.target.value })}
                    className="h-8 w-16 text-center"
                    type="number"
                  />
                </TableCell>
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
                        setNewType({ slug: "", label: "", sortOrder: "0" });
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
            {promoTypes.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                  No promo types yet.
                </TableCell>
              </TableRow>
            )}
            {promoTypes.map((pt) => (
              <PromoTypeRow
                key={pt.id}
                id={pt.id}
                slug={pt.slug}
                label={pt.label}
                sortOrder={pt.sortOrder}
                onUpdate={(updates) => updateMutation.mutate({ id: pt.id, ...updates })}
                onDelete={() => deleteMutation.mutate(pt.id)}
                isUpdating={updateMutation.isPending}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PromoTypeRow({
  id: _id,
  slug,
  label,
  sortOrder,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
}: {
  id: string;
  slug: string;
  label: string;
  sortOrder: number;
  onUpdate: (updates: { label?: string; sortOrder?: number }) => void;
  onDelete: () => void;
  isUpdating: boolean;
  isDeleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [editSort, setEditSort] = useState(String(sortOrder));

  if (editing) {
    return (
      <TableRow>
        <TableCell className="font-mono text-sm">{slug}</TableCell>
        <TableCell>
          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8" />
        </TableCell>
        <TableCell className="text-center">
          <Input
            value={editSort}
            onChange={(e) => setEditSort(e.target.value)}
            className="h-8 w-16 text-center"
            type="number"
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={isUpdating}
              onClick={() => {
                onUpdate({
                  label: editLabel.trim() || undefined,
                  sortOrder: Number.parseInt(editSort, 10) || 0,
                });
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{slug}</TableCell>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className="text-center text-sm text-muted-foreground">{sortOrder}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={isDeleting}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
