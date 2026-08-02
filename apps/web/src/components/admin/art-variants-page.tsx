import {
  LabelAddInput,
  LabelCell,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateSlugAndLabel,
  WellKnownCell,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import {
  useArtVariants,
  useCreateArtVariant,
  useDeleteArtVariant,
  useReorderArtVariants,
  useUpdateArtVariant,
} from "@/hooks/use-art-variants";
import { swapForReorder } from "@/lib/admin-reorder";

interface ArtVariantRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface ArtVariantDraft {
  slug: string;
  label: string;
}

const columns: AdminColumnDef<ArtVariantRow, ArtVariantDraft>[] = [
  {
    header: "Slug",
    sortValue: (artVariant) => artVariant.slug,
    cell: <SlugCell<ArtVariantRow> />,
    addCell: <SlugAddInput<ArtVariantDraft> placeholder="alternate" />,
  },
  {
    header: "Label",
    sortValue: (artVariant) => artVariant.label,
    cell: <LabelCell<ArtVariantRow> />,
    editCell: <LabelInput<ArtVariantDraft> />,
    addCell: <LabelAddInput<ArtVariantDraft> placeholder="Alternate Art" />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell<ArtVariantRow> />,
  },
];

export function ArtVariantsPage() {
  const { data } = useArtVariants();
  const createMutation = useCreateArtVariant();
  const updateMutation = useUpdateArtVariant();
  const deleteMutation = useDeleteArtVariant();
  const reorderMutation = useReorderArtVariants();
  const { artVariants } = data;

  function moveArtVariant(index: number, direction: -1 | 1) {
    const reordered = swapForReorder(artVariants, index, direction, (variant) => variant.slug);
    if (reordered) {
      reorderMutation.mutate(reordered);
    }
  }

  return (
    <AdminTable
      columns={columns}
      data={artVariants}
      getRowKey={(artVariant) => artVariant.slug}
      emptyText="No art variants yet."
      title="Art Variants"
      toolbar={
        <PageDescription>
          Art variants describe alternate artwork treatments for a printing (e.g. Normal, Alternate,
          Extended).
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) =>
          validateSlugAndLabel(draft.slug, draft.label, "alternate, extended-art"),
        label: "Add Art Variant",
      }}
      edit={{
        toDraft: (artVariant) => ({
          slug: artVariant.slug,
          label: artVariant.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: moveArtVariant,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "art-variants.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (artVariant) => deleteMutation.mutateAsync(artVariant.slug),
      }}
    />
  );
}
