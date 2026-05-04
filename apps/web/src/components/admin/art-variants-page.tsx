import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
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

  const columns: AdminColumnDef<ArtVariantRow, ArtVariantDraft>[] = [
    {
      header: "Slug",
      sortValue: (artVariant) => artVariant.slug,
      cell: (artVariant) => <span className="font-mono text-sm">{artVariant.slug}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.slug}
          onChange={(event) => set((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
          placeholder="alternate"
          className="h-8 w-40 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (artVariant) => artVariant.label,
      cell: (artVariant) => <span className="text-sm">{artVariant.label}</span>,
      editCell: (draft, set) => (
        <Input
          value={draft.label}
          onChange={(event) => set((prev) => ({ ...prev, label: event.target.value }))}
          className="h-8"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.label}
          onChange={(event) => set((prev) => ({ ...prev, label: event.target.value }))}
          placeholder="Alternate Art"
          className="h-8"
        />
      ),
    },
    {
      header: "Well-known",
      cell: (artVariant) => (
        <span className="text-muted-foreground text-sm">
          {artVariant.isWellKnown ? "Yes" : "No"}
        </span>
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={artVariants}
      getRowKey={(artVariant) => artVariant.slug}
      emptyText="No art variants yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Art variants describe alternate artwork treatments for a printing (e.g. Normal, Alternate,
          Extended).
        </p>
      }
      add={{
        emptyDraft: { slug: "", label: "" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
          }),
        validate: (draft) => {
          const slug = draft.slug.trim();
          const label = draft.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) {
            return "Slug must be kebab-case (e.g. alternate, extended-art)";
          }
          return null;
        },
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
