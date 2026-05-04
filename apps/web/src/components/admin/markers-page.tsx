import type { MarkerResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useReorderMarkers,
  useUpdateMarker,
} from "@/hooks/use-markers";

interface MarkerDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

export function MarkersPage() {
  const { data } = useMarkers();
  const createMutation = useCreateMarker();
  const updateMutation = useUpdateMarker();
  const deleteMutation = useDeleteMarker();
  const reorderMutation = useReorderMarkers();
  const markers = data.markers;

  function moveMarker(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= markers.length) {
      return;
    }
    const reordered = markers.map((m) => m.id);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  const columns: AdminColumnDef<MarkerResponse, MarkerDraft>[] = [
    {
      header: "Slug",
      sortValue: (m) => m.slug,
      cell: (m) => <span className="font-mono text-sm">{m.slug}</span>,
      addCell: (d, set) => (
        <Input
          value={d.slug}
          onChange={(e) => set((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
          placeholder="top-8"
          className="h-8 w-48 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (m) => m.label,
      cell: (m) => <span>{m.label}</span>,
      editCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Top 8"
          className="h-8"
        />
      ),
    },
    {
      header: "Description",
      sortValue: (m) => m.description ?? "",
      cell: (m) => (
        <span
          className="text-muted-foreground block max-w-xs truncate"
          title={m.description ?? undefined}
        >
          {m.description ?? "—"}
        </span>
      ),
      editCell: (d, set) => (
        <Input
          value={d.description}
          onChange={(e) => set((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description"
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.description}
          onChange={(e) => set((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Optional description"
          className="h-8"
        />
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={markers}
      getRowKey={(m) => m.id}
      emptyText="No markers yet."
      toolbar={
        <p className="text-muted-foreground">
          Markers describe what is physically printed on a card (e.g. promo stamp, Top 8 placement).
          Two printings with different markers are visually distinct and have separate prices.
        </p>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "", description: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            description: d.description.trim() || null,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!KEBAB_RE.test(slug)) {
            return "Slug must be kebab-case (e.g. top-8)";
          }
          return null;
        },
        label: "Add Marker",
      }}
      edit={{
        toDraft: (m) => ({
          id: m.id,
          slug: m.slug,
          label: m.label,
          description: m.description ?? "",
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            label: d.label.trim() || undefined,
            description: d.description.trim() || null,
          }),
      }}
      reorder={{
        onMove: moveMarker,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "markers.json",
        transform: (rows) =>
          rows.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest }) => rest),
      }}
      delete={{
        onDelete: (m) => deleteMutation.mutateAsync(m.id),
      }}
    />
  );
}
