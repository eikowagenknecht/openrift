import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useCreateRarity,
  useDeleteRarity,
  useRarities,
  useReorderRarities,
  useUpdateRarity,
} from "@/hooks/use-rarities";
import { contrastText } from "@/lib/color";

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

function SlugCell({ row }: AdminCellSlotProps<RarityRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<RarityRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function ColorCell({ row }: AdminCellSlotProps<RarityRow>) {
  if (!row) {
    return null;
  }
  if (!row.color) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block size-4 rounded border" style={{ backgroundColor: row.color }} />
      <span className="font-mono text-sm">{row.color}</span>
    </div>
  );
}

function PreviewCell({ row }: AdminCellSlotProps<RarityRow>) {
  if (!row) {
    return null;
  }
  return (
    <Badge
      style={row.color ? { backgroundColor: row.color, color: contrastText(row.color) } : undefined}
      variant={row.color ? "default" : "secondary"}
    >
      {row.label}
    </Badge>
  );
}

function WellKnownCell({ row }: AdminCellSlotProps<RarityRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<RarityDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) => setDraft((prev) => ({ ...prev, slug: event.target.value }))}
      placeholder="NewRarity"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<RarityDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      className="h-8"
    />
  );
}

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<RarityDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="New Rarity"
      className="h-8"
    />
  );
}

function ColorInput({ draft, setDraft }: AdminDraftSlotProps<RarityDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.color}
      onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
      placeholder="#E052B1"
      className="h-8 w-28 font-mono"
    />
  );
}

const columns: AdminColumnDef<RarityRow, RarityDraft>[] = [
  {
    header: "Slug",
    width: "w-40",
    sortValue: (rarity) => rarity.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    width: "w-40",
    sortValue: (rarity) => rarity.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Color",
    width: "w-36",
    cell: <ColorCell />,
    editCell: <ColorInput />,
    addCell: <ColorInput />,
  },
  {
    header: "Preview",
    width: "w-28",
    cell: <PreviewCell />,
  },
  {
    header: "Well-known",
    width: "w-24",
    cell: <WellKnownCell />,
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
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= rarities.length) {
      return;
    }
    const reordered = rarities.map((rarity) => rarity.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <AdminTable
      columns={columns}
      data={rarities}
      getRowKey={(rarity) => rarity.slug}
      emptyText="No rarities yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Rarities describe the scarcity tier of a printing (e.g. Common, Uncommon, Rare). Colors
          are shown throughout the UI wherever rarities appear.
        </p>
      }
      add={{
        emptyDraft: { slug: "", label: "", color: "#A6A6A6" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            color: draft.color.trim() || null,
          }),
        validate: (draft) => {
          const slug = draft.slug.trim();
          const label = draft.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          const color = draft.color.trim();
          if (color && !/^#[0-9a-fA-F]{6}$/u.test(color)) {
            return "Color must be a hex code (e.g. #E052B1)";
          }
          return null;
        },
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
