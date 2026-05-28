import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import {
  useCreateSuperType,
  useDeleteSuperType,
  useReorderSuperTypes,
  useSuperTypes,
  useUpdateSuperType,
} from "@/hooks/use-super-types";

interface SuperTypeRow {
  slug: string;
  label: string;
  sortOrder: number;
  isWellKnown: boolean;
}

interface SuperTypeDraft {
  slug: string;
  label: string;
}

function SlugCell({ row }: AdminCellSlotProps<SuperTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function LabelCell({ row }: AdminCellSlotProps<SuperTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

function WellKnownCell({ row }: AdminCellSlotProps<SuperTypeRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

function SlugAddInput({ draft, setDraft }: AdminDraftSlotProps<SuperTypeDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))
      }
      placeholder="champion"
      className="h-8 w-40 font-mono"
    />
  );
}

function LabelInput({ draft, setDraft }: AdminDraftSlotProps<SuperTypeDraft>) {
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

function LabelAddInput({ draft, setDraft }: AdminDraftSlotProps<SuperTypeDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder="Champion"
      className="h-8"
    />
  );
}

const columns: AdminColumnDef<SuperTypeRow, SuperTypeDraft>[] = [
  {
    header: "Slug",
    sortValue: (superType) => superType.slug,
    cell: <SlugCell />,
    addCell: <SlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (superType) => superType.label,
    cell: <LabelCell />,
    editCell: <LabelInput />,
    addCell: <LabelAddInput />,
  },
  {
    header: "Well-known",
    cell: <WellKnownCell />,
  },
];

export function SuperTypesPage() {
  const { data } = useSuperTypes();
  const createMutation = useCreateSuperType();
  const updateMutation = useUpdateSuperType();
  const deleteMutation = useDeleteSuperType();
  const reorderMutation = useReorderSuperTypes();
  const { superTypes } = data;

  function moveSuperType(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= superTypes.length) {
      return;
    }
    const reordered = superTypes.map((superType) => superType.slug);
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <AdminTable
      columns={columns}
      data={superTypes}
      getRowKey={(superType) => superType.slug}
      emptyText="No super types yet."
      toolbar={
        <p className="text-muted-foreground text-sm">
          Super types are qualifiers applied on top of a card&apos;s type (e.g. Champion,
          Signature).
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
          if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u.test(slug)) {
            return "Slug must be kebab-case (e.g. champion, signature)";
          }
          return null;
        },
        label: "Add Super Type",
      }}
      edit={{
        toDraft: (superType) => ({
          slug: superType.slug,
          label: superType.label,
        }),
        onSave: (draft) =>
          updateMutation.mutateAsync({
            slug: draft.slug,
            label: draft.label.trim() || undefined,
          }),
      }}
      reorder={{
        onMove: moveSuperType,
        isPending: reorderMutation.isPending,
      }}
      export={{
        filename: "super-types.json",
        transform: (rows) => rows.map(({ isWellKnown: _isWellKnown, ...rest }) => rest),
      }}
      delete={{
        onDelete: (superType) => deleteMutation.mutateAsync(superType.slug),
      }}
    />
  );
}
