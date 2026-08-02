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
  validateRequiredSlugAndLabel,
  WellKnownCell,
} from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import {
  useCreateRarity,
  useDeleteRarity,
  useRarities,
  useReorderRarities,
  useUpdateRarity,
} from "@/hooks/use-rarities";
import { swapForReorder } from "@/lib/admin-reorder";

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
    // Rarity slugs are PascalCase (NewRarity), not kebab-case.
    addCell: <SlugAddInput<RarityDraft> placeholder="NewRarity" lowercase={false} />,
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

  function moveRarity(index: number, direction: -1 | 1) {
    const reordered = swapForReorder(rarities, index, direction, (rarity) => rarity.slug);
    if (reordered) {
      reorderMutation.mutate(reordered);
    }
  }

  return (
    <AdminTable
      columns={columns}
      data={rarities}
      getRowKey={(rarity) => rarity.slug}
      emptyText="No rarities yet."
      title="Rarities"
      toolbar={
        <PageDescription>
          Rarities describe the scarcity tier of a printing (e.g. Common, Uncommon, Rare). Colors
          are shown throughout the UI wherever rarities appear.
        </PageDescription>
      }
      add={{
        emptyDraft: { slug: "", label: "", color: "#A6A6A6" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            color: draft.color.trim() || null,
          }),
        validate: (draft) =>
          validateRequiredSlugAndLabel(draft.slug, draft.label) ??
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
        onMove: moveRarity,
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
