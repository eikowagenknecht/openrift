import type { PromoTypeResponse } from "@openrift/shared";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreatePromoType,
  useDeletePromoType,
  usePromoTypes,
  useUpdatePromoType,
} from "@/hooks/use-promo-types";

interface PromoTypeDraft {
  id: string;
  slug: string;
  label: string;
  sortOrder: string;
}

const KEBAB_RE = /^[a-z][a-z0-9]+(-[a-z0-9]+)*$/;

export function PromoTypesPage() {
  const { data } = usePromoTypes();
  const createMutation = useCreatePromoType();
  const updateMutation = useUpdatePromoType();
  const deleteMutation = useDeletePromoType();
  const { promoTypes } = data;

  const columns: AdminColumnDef<PromoTypeResponse, PromoTypeDraft>[] = [
    {
      header: "Slug",
      sortValue: (pt) => pt.slug,
      cell: (pt) => <span className="font-mono text-sm">{pt.slug}</span>,
      addCell: (d, set) => (
        <Input
          value={d.slug}
          onChange={(e) => set((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
          placeholder="nexus-night"
          className="h-8 w-48 font-mono"
        />
      ),
    },
    {
      header: "Label",
      sortValue: (pt) => pt.label,
      cell: (pt) => <span className="text-sm">{pt.label}</span>,
      editCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          className="h-8"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.label}
          onChange={(e) => set((prev) => ({ ...prev, label: e.target.value }))}
          placeholder="Nexus Night"
          className="h-8"
        />
      ),
    },
    {
      header: "Sort Order",
      align: "center",
      width: "w-24",
      sortValue: (pt) => pt.sortOrder,
      cell: (pt) => <span className="text-sm text-muted-foreground">{pt.sortOrder}</span>,
      editCell: (d, set) => (
        <Input
          value={d.sortOrder}
          onChange={(e) => set((prev) => ({ ...prev, sortOrder: e.target.value }))}
          className="h-8 w-16 text-center"
          type="number"
        />
      ),
      addCell: (d, set) => (
        <Input
          value={d.sortOrder}
          onChange={(e) => set((prev) => ({ ...prev, sortOrder: e.target.value }))}
          className="h-8 w-16 text-center"
          type="number"
        />
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={promoTypes}
      getRowKey={(pt) => pt.id}
      emptyText="No promo types yet."
      toolbar={
        <p className="text-sm text-muted-foreground">
          Promo types classify promotional printings (e.g. Summoner Skirmish, Nexus Night).
        </p>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "", sortOrder: "0" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            sortOrder: Number.parseInt(d.sortOrder, 10) || 0,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!KEBAB_RE.test(slug)) {
            return "Slug must be kebab-case (e.g. nexus-night)";
          }
          return null;
        },
        label: "Add Promo Type",
      }}
      edit={{
        toDraft: (pt) => ({
          id: pt.id,
          slug: pt.slug,
          label: pt.label,
          sortOrder: String(pt.sortOrder),
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            label: d.label.trim() || undefined,
            sortOrder: Number.parseInt(d.sortOrder, 10) || 0,
          }),
      }}
      delete={{
        onDelete: (pt) => deleteMutation.mutateAsync(pt.id),
      }}
    />
  );
}
