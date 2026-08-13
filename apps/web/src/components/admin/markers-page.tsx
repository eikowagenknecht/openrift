import type { MarkerResponse } from "@openrift/shared";

import {
  DescriptionCell,
  DescriptionInput,
  LabelAddInput,
  LabelCell,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateSlugAndLabel,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import {
  useCreateMarker,
  useDeleteMarker,
  useMarkers,
  useReorderMarkers,
  useUpdateMarker,
} from "@/hooks/use-markers";
import { flatReorder } from "@/lib/admin-reorder";

interface MarkerDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
}

const columns: AdminColumnDef<MarkerResponse, MarkerDraft>[] = [
  {
    header: "Slug",
    sortValue: (m) => m.slug,
    cell: <SlugCell<MarkerResponse> />,
    addCell: <SlugAddInput<MarkerDraft> placeholder="top-8" width="w-48" />,
  },
  {
    header: "Label",
    sortValue: (m) => m.label,
    cell: <LabelCell<MarkerResponse> />,
    editCell: <LabelInput<MarkerDraft> />,
    addCell: <LabelAddInput<MarkerDraft> placeholder="Top 8" />,
  },
  {
    header: "Description",
    sortValue: (m) => m.description ?? "",
    cell: <DescriptionCell<MarkerResponse> />,
    editCell: <DescriptionInput<MarkerDraft> />,
    addCell: <DescriptionInput<MarkerDraft> />,
  },
];

export function MarkersPage() {
  const { data } = useMarkers();
  const createMutation = useCreateMarker();
  const updateMutation = useUpdateMarker();
  const deleteMutation = useDeleteMarker();
  const reorderMutation = useReorderMarkers();
  const markers = data.markers;

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
        validate: (d) => validateSlugAndLabel(d.slug, d.label, "top-8"),
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
        moves: flatReorder(markers, (m) => m.id),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
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
