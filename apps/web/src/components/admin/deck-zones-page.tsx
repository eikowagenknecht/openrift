import { LabelCell, LabelInput, SlugCell } from "@/components/admin/admin-crud-shared";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { useDeckZones, useReorderDeckZones, useUpdateDeckZone } from "@/hooks/use-deck-zones";
import { flatReorder } from "@/lib/admin-reorder";

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

const columns: AdminColumnDef<DeckZoneRow, DeckZoneDraft>[] = [
  {
    header: "Slug",
    sortValue: (zone) => zone.slug,
    cell: <SlugCell<DeckZoneRow> />,
  },
  {
    header: "Label",
    sortValue: (zone) => zone.label,
    cell: <LabelCell<DeckZoneRow> />,
    editCell: <LabelInput<DeckZoneDraft> />,
  },
];

export function DeckZonesPage() {
  const { data } = useDeckZones();
  const updateMutation = useUpdateDeckZone();
  const reorderMutation = useReorderDeckZones();
  const { deckZones } = data;

  return (
    <AdminTable
      columns={columns}
      data={deckZones}
      getRowKey={(zone) => zone.slug}
      emptyText="No deck zones."
      title="Deck Zones"
      toolbar={
        <PageDescription>
          Deck zones define the sections of a deck (Legend, Main Deck, etc.). Reorder to control
          display order in the deck builder and import views.
        </PageDescription>
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
        moves: flatReorder(deckZones, (zone) => zone.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
    />
  );
}
