import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
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

  const columns: AdminColumnDef<DeckZoneRow, DeckZoneDraft>[] = [
    {
      header: "Slug",
      sortValue: (zone) => zone.slug,
      cell: (zone) => <span className="font-mono text-sm">{zone.slug}</span>,
    },
    {
      header: "Label",
      sortValue: (zone) => zone.label,
      cell: (zone) => <span className="text-sm">{zone.label}</span>,
      editCell: (draft, set) => (
        <Input
          value={draft.label}
          onChange={(event) => set((prev) => ({ ...prev, label: event.target.value }))}
          className="h-8"
        />
      ),
    },
  ];

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
