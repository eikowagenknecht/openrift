import { LabelInput, validateSlugAndLabel } from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Input } from "@/components/ui/input";
import {
  useArtVariants,
  useCreateArtVariant,
  useDeleteArtVariant,
  useReorderArtVariants,
  useUpdateArtVariant,
} from "@/hooks/use-art-variants";

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

function SlugCell({ row }: AdminCellSlotProps<ArtVariantRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<ArtVariantRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function WellKnownCell({ row }: AdminCellSlotProps<ArtVariantRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<ArtVariantDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))
      }
      placeholder="alternate"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<ArtVariantDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="Alternate Art"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<ArtVariantRow, ArtVariantDraft>[] = [
  {
    header: "Slug",
    sortValue: (artVariant) => artVariant.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (artVariant) => artVariant.label,
    cell: <LabelCell />,
    editCell: <LabelInput<ArtVariantDraft> />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell />,
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
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= artVariants.length) {
      return;
    }
    const reordered = artVariants.map((artVariant) => artVariant.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
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
