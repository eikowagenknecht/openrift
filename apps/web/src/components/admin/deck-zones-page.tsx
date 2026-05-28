import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import { useDeckZones, useReorderDeckZones, useUpdateDeckZone } from "@/hooks/use-deck-zones";

interface DeckZoneRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface DeckZoneDraft {
  slug: string;
  label: string;
}

function SlugCell({ row }: AdminCellSlotProps<DeckZoneRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<DeckZoneRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<DeckZoneDraft>) {
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

const columns: AdminColumnDef<DeckZoneRow, DeckZoneDraft>[] = [
  {
    header: "Slug",
    sortValue: (zone) => zone.slug,
    cell: <SlugCell />,
  },
  {
    header: "Label",
    sortValue: (zone) => zone.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
  },
];

export function DeckZonesPage() {
  const { data } = useDeckZones();
  const updateMutation = useUpdateDeckZone();
  const reorderMutation = useReorderDeckZones();
  const { deckZones } = data;

  function moveZone(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= deckZones.length) {
      return;
    }
    const reordered = deckZones.map((zone) => zone.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <AdminTable
      columns={columns}
      data={deckZones}
      getRowKey={(zone) => zone.slug}
      emptyText="No deck zones."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Deck zones define the sections of a deck (Legend, Main Deck, etc.). Reorder to control
          display order in the deck builder and import views.
        </p>
      }
      edit={{
        toDraft: (zone) => ({ slug: zone.slug, label: zone.label }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: moveZone,
        isPending: reorderMutation.isPending,
      }}
    />
  );
}
