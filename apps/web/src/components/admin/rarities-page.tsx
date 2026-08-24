import {
  ColorCell,
  ColorInput,
  ColorPreviewCell,
  LabelAddInput,
  LabelCell,
  LabelInput,
  SlugAddInput,
  SlugCell,
  validateHexColor,
  validateSlugAndLabel,
  WellKnownCell,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import {
  useCreateRarity,
  useDeleteRarity,
  useRarities,
  useReorderRarities,
  useUpdateRarity,
} from "@/hooks/use-rarities";
import { flatReorder } from "@/lib/admin-reorder";

interface RarityRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
  color: string | null;
}

interface RarityDraft {
  slug: string;
  label: string;
  color: string;
}

const columns: AdminColumnDef<RarityRow, RarityDraft>[] = [
  {
    header: "Slug",
    width: "w-40",
    sortValue: (rarity) => rarity.slug,
    cell: <SlugCell<RarityRow> />,
    addCell: <SlugAddInput<RarityDraft> placeholder="new-rarity" />,
  },
  {
    header: "Label",
    width: "w-40",
    sortValue: (rarity) => rarity.label,
    cell: <LabelCell<RarityRow> />,
    editCell: <LabelInput<RarityDraft> />,
    addCell: <LabelAddInput<RarityDraft> placeholder="New Rarity" />,
  },
  {
    header: "Color",
    width: "w-36",
    cell: <ColorCell<RarityRow> />,
    editCell: <ColorInput<RarityDraft> placeholder="#E052B1" />,
    addCell: <ColorInput<RarityDraft> placeholder="#E052B1" />,
  },
  {
    header: "Preview",
    width: "w-28",
    cell: <ColorPreviewCell<RarityRow> />,
  },
  {
    header: "Well-known",
    width: "w-24",
    cell: <WellKnownCell<RarityRow> />,
  },
];

export function RaritiesPage() {
  const { data } = useRarities();
  const createMutation = useCreateRarity();
  const updateMutation = useUpdateRarity();
  const deleteMutation = useDeleteRarity();
  const reorderMutation = useReorderRarities();
  const { rarities } = data;

  return (
    <AdminTable
      columns={columns}
      data={rarities}
      getRowKey={(rarity) => rarity.slug}
      emptyText="No rarities yet."
      title="Rarities"
      add={{
        emptyDraft: { slug: "", label: "", color: "#A6A6A6" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            color: draft.color.trim() || null,
          }),
        validate: (draft) =>
          validateSlugAndLabel(draft.slug, draft.label, "new-rarity") ??
          validateHexColor(draft.color, "#E052B1"),
        label: "Add Rarity",
      }}
      edit={{
        toDraft: (rarity) => ({
          slug: rarity.slug,
          label: rarity.label,
          color: rarity.color ?? "",
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
            color: draft.color.trim() || null,
          }),
      }}
      reorder={{
        moves: flatReorder(rarities, (rarity) => rarity.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "rarities.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (rarity) => deleteMutation.mutateAsync(rarity.slug),
      }}
    />
  );
}
