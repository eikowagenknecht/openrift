import type { MarkerResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Input } from "@/components/ui/input";
import {
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useReorderMarkers,
  useUpdateMarker,
} from "@/hooks/use-markers";
import { isValidSlug } from "@/lib/admin-slug";

interface MarkerDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
}

function SlugCell({ row }: AdminCellSlotProps<MarkerResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<MarkerResponse>) {
  if (!row) {
    return null;
  }
  return <span>{row.label}</span>;
}

function DescriptionCell({ row }: AdminCellSlotProps<MarkerResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span
      className="text-muted-foreground block max-w-xs truncate"
      title={row.description ?? undefined}
    >
      {row.description ?? "—"}
    </span>
  );
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<MarkerDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      placeholder="top-8"
      className="h-8 w-48 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<MarkerDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      className="h-8"
    />
  );
}

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<MarkerDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      placeholder="Top 8"
      className="h-8"
    />
  );
}

function DescriptionInput({ draft, setDraft }: AdminDraftSlotProps<MarkerDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="Optional description"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<MarkerResponse, MarkerDraft>[] = [
  {
    header: "Slug",
    sortValue: (m) => m.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (m) => m.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Description",
    sortValue: (m) => m.description ?? "",
    cell: <DescriptionCell />,
    editCell: <DescriptionInput />,
    addCell: <DescriptionInput />,
  },
];

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

  return (
    <AdminTable
      columns={columns}
      data={markers}
      getRowKey={(m) => m.id}
      emptyText="No markers yet."
      title="Markers"
      toolbar={
        <PageDescription>
          Markers describe what is physically printed on a card (e.g. promo stamp, Top 8 placement).
          Two printings with different markers are visually distinct and have separate prices.
        </PageDescription>
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
          if (!isValidSlug(slug)) {
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
