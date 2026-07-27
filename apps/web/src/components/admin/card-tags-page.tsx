import type { ClassifiedCardTag, TagCategoryResponse } from "@openrift/shared";
import { useState } from "react";

import {
  CategoryDescriptionInput,
  CategorySelectOptions,
  validateSlugAndLabel,
} from "@/components/admin/admin-crud-shared";
import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  useCardTags,
  useCreateTagCategory,
  useDeleteTagCategory,
  useDetectLegendTags,
  useSetTagCategory,
  useTagCategoryList,
  useUpdateTagCategory,
} from "@/hooks/use-card-tags";

interface TagCategoryDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
}

/** Select sentinel for "no category" — BaseUI Select values can't be null. */
const UNCLASSIFIED = "__unclassified";

export function CardTagsPage() {
  const { data: tagsData } = useCardTags();
  const { data: categoriesData } = useTagCategoryList();

  return (
    <div className="space-y-8">
      <AdminPageTopBar title="Card Tags" />
      <CategoriesSection categories={categoriesData.categories} />

      <ClassificationSection tags={tagsData.tags} categories={categoriesData.categories} />
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────

function CategorySlugCell({ row }: AdminCellSlotProps<TagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function CategoryLabelCell({ row }: AdminCellSlotProps<TagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span>{row.label}</span>;
}

function CategoryDescriptionCell({ row }: AdminCellSlotProps<TagCategoryResponse>) {
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

function CategoryTagCountCell({ row }: AdminCellSlotProps<TagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.tagCount}</span>;
}

function CategorySlugAddInput({ draft, setDraft }: AdminDraftSlotProps<TagCategoryDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      placeholder="species"
      className="h-8 w-48 font-mono"
    />
  );
}

function CategoryLabelInput({ draft, setDraft }: AdminDraftSlotProps<TagCategoryDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      placeholder="Species"
      className="h-8"
    />
  );
}

const categoryColumns: AdminColumnDef<TagCategoryResponse, TagCategoryDraft>[] = [
  {
    header: "Slug",
    sortValue: (cat) => cat.slug,
    cell: <CategorySlugCell />,
    addCell: <CategorySlugAddInput />,
  },
  {
    header: "Label",
    sortValue: (cat) => cat.label,
    cell: <CategoryLabelCell />,
    editCell: <CategoryLabelInput />,
    addCell: <CategoryLabelInput />,
  },
  {
    header: "Description",
    sortValue: (cat) => cat.description ?? "",
    cell: <CategoryDescriptionCell />,
    editCell: <CategoryDescriptionInput<TagCategoryDraft> />,
    addCell: <CategoryDescriptionInput<TagCategoryDraft> />,
  },
  {
    header: "Tags",
    sortValue: (cat) => cat.tagCount,
    align: "right",
    cell: <CategoryTagCountCell />,
  },
];

function CategoriesSection({ categories }: { categories: TagCategoryResponse[] }) {
  const createMutation = useCreateTagCategory();
  const updateMutation = useUpdateTagCategory();
  const deleteMutation = useDeleteTagCategory();

  return (
    <AdminTable
      columns={categoryColumns}
      data={categories}
      getRowKey={(cat) => cat.id}
      emptyText="No categories yet — create one before classifying tags."
      toolbar={
        <PageDescription>
          Categories group the printed card tags into filter sections (Region, Champion, Species,
          …). Delete is blocked while tags are still classified under the category.
        </PageDescription>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "", description: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            description: d.description.trim() || null,
          }),
        validate: (d) => validateSlugAndLabel(d.slug, d.label, "species"),
        label: "Add Category",
      }}
      edit={{
        toDraft: (cat) => ({
          id: cat.id,
          slug: cat.slug,
          label: cat.label,
          description: cat.description ?? "",
        }),
        onSave: (d) =>
          updateMutation.mutateAsync({
            id: d.id,
            slug: d.slug.trim() || undefined,
            label: d.label.trim() || undefined,
            description: d.description.trim() || null,
          }),
      }}
      delete={{
        onDelete: (cat) => deleteMutation.mutateAsync(cat.id),
      }}
    />
  );
}

// ── Classification ────────────────────────────────────────────────────────

function TagNameCell({ row }: AdminCellSlotProps<ClassifiedCardTag>) {
  if (!row) {
    return null;
  }
  return (
    <span>
      {row.tag}
      {row.cardCount === 0 && (
        <span className="text-muted-foreground ml-2 text-xs">no longer on any card</span>
      )}
    </span>
  );
}

function TagCardCountCell({ row }: AdminCellSlotProps<ClassifiedCardTag>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.cardCount}</span>;
}

interface ClassificationSelectProps extends AdminCellSlotProps<ClassifiedCardTag> {
  items: { value: string; label: string }[];
  onSetCategory?: (tag: string, categoryId: string | null) => void;
}

function ClassificationCategorySelect({ row, items, onSetCategory }: ClassificationSelectProps) {
  if (!row) {
    return null;
  }
  return (
    <Select
      items={items}
      value={row.categoryId ?? UNCLASSIFIED}
      onValueChange={(next) => {
        if (next !== null) {
          onSetCategory?.(row.tag, next === UNCLASSIFIED ? null : next);
        }
      }}
    >
      <SelectTrigger className="h-8 w-44" aria-label={`Category for ${row.tag}`}>
        <SelectValue />
      </SelectTrigger>
      <CategorySelectOptions items={items} />
    </Select>
  );
}

function ClassificationSection({
  tags,
  categories,
}: {
  tags: ClassifiedCardTag[];
  categories: TagCategoryResponse[];
}) {
  const setCategoryMutation = useSetTagCategory();
  const detectMutation = useDetectLegendTags();
  const [filter, setFilter] = useState("");
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  // Target for the detect helper: the "legend" category by convention,
  // falling back to nothing (button disabled) if it was deleted/renamed away.
  const legendCategory = categories.find((cat) => cat.slug === "legend");
  const detectLegendTags = async () => {
    if (!legendCategory) {
      return;
    }
    const result = await detectMutation.mutateAsync({ categoryId: legendCategory.id });
    setDetectResult(
      result.assigned === 0
        ? `All ${result.found} Legend tags were already classified.`
        : `Classified ${result.assigned} of ${result.found} Legend tags as ${legendCategory.label}.`,
    );
  };

  const categoryItems = [
    { value: UNCLASSIFIED, label: "Unclassified" },
    ...categories.map((cat) => ({ value: cat.id, label: cat.label })),
  ];

  const query = filter.trim().toLowerCase();
  const visible = tags
    .filter((tag) => (query ? tag.tag.toLowerCase().includes(query) : true))
    .filter((tag) => (unclassifiedOnly ? tag.categoryId === null : true))
    // Unclassified tags first (they're the work queue), then alphabetical.
    .toSorted(
      (a, b) =>
        Number(a.categoryId !== null) - Number(b.categoryId !== null) || a.tag.localeCompare(b.tag),
    );
  const unclassifiedCount = tags.filter((tag) => tag.categoryId === null).length;

  const columns: AdminColumnDef<ClassifiedCardTag, never>[] = [
    {
      header: "Tag",
      sortValue: (t) => t.tag,
      cell: <TagNameCell />,
    },
    {
      header: "Cards",
      sortValue: (t) => t.cardCount,
      align: "right",
      cell: <TagCardCountCell />,
    },
    {
      header: "Category",
      sortValue: (t) => t.categoryId ?? "",
      cell: (
        <ClassificationCategorySelect
          items={categoryItems}
          onSetCategory={(tag, categoryId) => setCategoryMutation.mutate({ tag, categoryId })}
        />
      ),
    },
  ];

  return (
    <AdminTable
      columns={columns}
      data={visible}
      getRowKey={(t) => t.tag}
      emptyText={query || unclassifiedOnly ? "No tags match." : "No printed tags found."}
      toolbar={
        <div className="space-y-3">
          <PageDescription>
            Every distinct tag printed on a card, with the category it belongs to. New sets add tags
            as unclassified; they show under &ldquo;Other tags&rdquo; in the filters until
            classified here.
          </PageDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tags…"
              className="h-8 w-56"
            />
            <Toggle
              pressed={unclassifiedOnly}
              onPressedChange={setUnclassifiedOnly}
              aria-label="Show unclassified tags only"
            >
              Unclassified only ({unclassifiedCount})
            </Toggle>
            <Button
              variant="outline"
              size="sm"
              onClick={detectLegendTags}
              disabled={!legendCategory || detectMutation.isPending}
              title={
                legendCategory
                  ? "Classify every tag found on a Legend card as Legend"
                  : "Create a category with slug 'legend' first"
              }
            >
              Detect legend tags
            </Button>
            {detectResult && <span className="text-muted-foreground text-sm">{detectResult}</span>}
          </div>
        </div>
      }
    />
  );
}
