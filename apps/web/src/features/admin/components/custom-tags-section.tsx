import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type {
  CustomTagCategoryResponse,
  CustomTagResponse,
} from "@openrift/shared/types/api/admin";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { DescriptionInput } from "@/features/admin/components/admin-crud-shared";
import { AdminTable } from "@/features/admin/components/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/features/admin/components/admin-table";
import { CategorySelect } from "@/features/admin/components/card-tag-editor";
import { isValidSlug } from "@/features/admin/lib/admin-slug";
import type { CustomTagDraft } from "@/features/admin/lib/custom-tags-drafts";
import {
  useClearCustomTagCards,
  useCreateCustomTag,
  useDeleteCustomTag,
  useUpdateCustomTag,
} from "@/features/collections/hooks/use-custom-tags";

function TagSlugCell({ row }: AdminCellSlotProps<CustomTagResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function TagLabelCell({ row }: AdminCellSlotProps<CustomTagResponse>) {
  if (!row) {
    return null;
  }
  return <span>{row.label}</span>;
}

function TagCategoryCell({ row }: AdminCellSlotProps<CustomTagResponse>) {
  if (!row) {
    return null;
  }
  return <span>{row.categoryLabel}</span>;
}

function TagDescriptionCell({ row }: AdminCellSlotProps<CustomTagResponse>) {
  if (!row) {
    return null;
  }
  return (
    <span
      className="text-muted-foreground block max-w-xs truncate"
      title={row.description ?? undefined}
    >
      {row.description ?? "—"}
    </span>
  );
}

function TagCardCountCell({ row }: AdminCellSlotProps<CustomTagResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.cardCount}</span>;
}

function TagSlugAddInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      placeholder="bandle-city"
      className="h-8 w-48 font-mono"
    />
  );
}

function TagLabelInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      className="h-8"
    />
  );
}

function TagLabelAddInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      placeholder="Bandle City"
      className="h-8"
    />
  );
}

interface TagCategorySelectProps extends AdminDraftSlotProps<CustomTagDraft> {
  items: { value: string; label: string }[];
}

function TagCategorySelect({ draft, setDraft, items }: TagCategorySelectProps) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <CategorySelect
      items={items}
      value={draft.categoryId}
      onChange={(id) => setDraft((prev) => ({ ...prev, categoryId: id }))}
    />
  );
}

/** `row` is injected by AdminTable via cloneElement. */
export function TagClearCardsAction({
  row,
  onClear,
}: AdminCellSlotProps<CustomTagResponse> & {
  onClear?: (tag: CustomTagResponse) => Promise<unknown>;
}) {
  if (!row || !onClear || row.cardCount === 0) {
    return null;
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" />}>Clear</AlertDialogTrigger>
      <AlertDialogContent>
        <DialogForm onSubmit={() => void onClear(row)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear “{row.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes this tag from{" "}
              {row.cardCount === 1 ? "its 1 card" : `all ${row.cardCount} cards`}. The tag itself is
              kept, so it can be filled again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogPrimitive.Close render={<Button type="submit" variant="destructive" />}>
              Clear
            </AlertDialogPrimitive.Close>
          </AlertDialogFooter>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TagsSection({
  tags,
  categories,
}: {
  tags: CustomTagResponse[];
  categories: CustomTagCategoryResponse[];
}) {
  const createMutation = useCreateCustomTag();
  const updateMutation = useUpdateCustomTag();
  const deleteMutation = useDeleteCustomTag();
  const clearMutation = useClearCustomTagCards();

  const defaultCategoryId = categories[0]?.id ?? "";
  const categoryItems = categories.map((cat) => ({ value: cat.id, label: cat.label }));

  const columns: AdminColumnDef<CustomTagResponse, CustomTagDraft>[] = [
    {
      header: "Slug",
      sortValue: (t) => t.slug,
      cell: <TagSlugCell />,
      addCell: <TagSlugAddInput />,
    },
    {
      header: "Label",
      sortValue: (t) => t.label,
      cell: <TagLabelCell />,
      editCell: <TagLabelInput />,
      addCell: <TagLabelAddInput />,
    },
    {
      header: "Category",
      sortValue: (t) => t.categoryLabel,
      cell: <TagCategoryCell />,
      editCell: <TagCategorySelect items={categoryItems} />,
      addCell: <TagCategorySelect items={categoryItems} />,
    },
    {
      header: "Description",
      sortValue: (t) => t.description ?? "",
      cell: <TagDescriptionCell />,
      editCell: <DescriptionInput<CustomTagDraft> />,
      addCell: <DescriptionInput<CustomTagDraft> />,
    },
    {
      header: "Cards",
      sortValue: (t) => t.cardCount,
      align: "right",
      cell: <TagCardCountCell />,
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={tags}
      getRowKey={(t) => t.id}
      emptyText="No custom tags yet."
      toolbar={
        <p className="text-muted-foreground">
          Admin-curated supplemental tags attachable to any card. Used by custom deck-builder
          formats (e.g. region-locked freeform). Pick a category to scope the tag to one format.
        </p>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "", categoryId: defaultCategoryId, description: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            categoryId: d.categoryId,
            description: d.description.trim() || null,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!d.categoryId) {
            return "Pick a category (create one first if none exist)";
          }
          if (!isValidSlug(slug)) {
            return "Slug must be kebab-case (e.g. bandle-city)";
          }
          return null;
        },
        label: "Add Custom Tag",
      }}
      edit={{
        toDraft: (t) => ({
          id: t.id,
          slug: t.slug,
          label: t.label,
          categoryId: t.categoryId,
          description: t.description ?? "",
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            label: d.label.trim() || undefined,
            categoryId: d.categoryId || undefined,
            description: d.description.trim() || null,
          }),
      }}
      delete={{
        onDelete: (t) => deleteMutation.mutateAsync(t.id),
      }}
      actions={<TagClearCardsAction onClear={(t) => clearMutation.mutateAsync(t.id)} />}
    />
  );
}
