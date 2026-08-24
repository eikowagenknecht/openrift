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
  useCreateDomain,
  useDeleteDomain,
  useDomains,
  useReorderDomains,
  useUpdateDomain,
} from "@/hooks/use-domains";
import { flatReorder } from "@/lib/admin-reorder";

interface DomainRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
  color: string | null;
}

interface DomainDraft {
  slug: string;
  label: string;
  color: string;
}

const columns: AdminColumnDef<DomainRow, DomainDraft>[] = [
  {
    header: "Slug",
    width: "w-40",
    sortValue: (domain) => domain.slug,
    cell: <SlugCell<DomainRow> />,
    addCell: <SlugAddInput<DomainDraft> placeholder="new-domain" />,
  },
  {
    header: "Label",
    width: "w-40",
    sortValue: (domain) => domain.label,
    cell: <LabelCell<DomainRow> />,
    editCell: <LabelInput<DomainDraft> />,
    addCell: <LabelAddInput<DomainDraft> placeholder="New Domain" />,
  },
  {
    header: "Color",
    width: "w-36",
    cell: <ColorCell<DomainRow> />,
    editCell: <ColorInput<DomainDraft> placeholder="#CB212D" />,
    addCell: <ColorInput<DomainDraft> placeholder="#CB212D" />,
  },
  {
    header: "Preview",
    width: "w-28",
    cell: <ColorPreviewCell<DomainRow> />,
  },
  {
    header: "Well-known",
    width: "w-24",
    cell: <WellKnownCell<DomainRow> />,
  },
];

export function DomainsPage() {
  const { data } = useDomains();
  const createMutation = useCreateDomain();
  const updateMutation = useUpdateDomain();
  const deleteMutation = useDeleteDomain();
  const reorderMutation = useReorderDomains();
  const { domains } = data;

  return (
    <AdminTable
      columns={columns}
      data={domains}
      getRowKey={(domain) => domain.slug}
      emptyText="No domains yet."
      title="Domains"
      add={{
        emptyDraft: { slug: "", label: "", color: "#737373" },
        onSave: (draft) =>
          createMutation.mutateAsync({
            slug: draft.slug.trim(),
            label: draft.label.trim(),
            color: draft.color.trim() || null,
          }),
        validate: (draft) =>
          validateSlugAndLabel(draft.slug, draft.label, "new-domain") ??
          validateHexColor(draft.color, "#CB212D"),
        label: "Add Domain",
      }}
      edit={{
        toDraft: (domain) => ({
          slug: domain.slug,
          label: domain.label,
          color: domain.color ?? "",
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
            color: draft.color.trim() || null,
          }),
      }}
      reorder={{
        moves: flatReorder(domains, (domain) => domain.slug),
        onReorder: (keys) => reorderMutation.mutateAsync(keys),
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "domains.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (domain) => deleteMutation.mutateAsync(domain.slug),
      }}
    />
  );
}
