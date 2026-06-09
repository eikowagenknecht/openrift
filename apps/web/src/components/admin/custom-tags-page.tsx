import type { CustomTagCategoryResponse, CustomTagResponse } from "@openrift/shared";
import { useMemo, useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAllCards } from "@/hooks/use-admin-card-queries";
import {
  useAddCardsToCustomTag,
  useCardCustomTags,
  useCreateCustomTag,
  useCreateCustomTagCategory,
  useCustomTagCategories,
  useCustomTags,
  useDeleteCustomTag,
  useDeleteCustomTagCategory,
  useSetCardCustomTags,
  useUpdateCustomTag,
  useUpdateCustomTagCategory,
} from "@/hooks/use-custom-tags";
import { isValidSlug } from "@/lib/admin-slug";
import type { BulkImportPlan } from "@/lib/custom-tag-bulk-import";
import { planCustomTagBulkImport } from "@/lib/custom-tag-bulk-import";

interface CustomTagDraft {
  id: string;
  slug: string;
  label: string;
  categoryId: string;
  description: string;
}

interface CustomTagCategoryDraft {
  id: string;
  slug: string;
  label: string;
  description: string;
}

// Mirrors `slugRegex` in apps/api/src/routes/admin/schemas.ts — keep in sync
// so the UI rejects exactly what the server would reject.

export function CustomTagsPage() {
  const { data: tagsData } = useCustomTags();
  const { data: categoriesData } = useCustomTagCategories();
  const tags = tagsData.tags;
  const categories = categoriesData.categories;

  return (
    <div className="space-y-8">
      <CategoriesSection categories={categories} />

      <TagsSection tags={tags} categories={categories} />

      <CardTagEditor tags={tags} />

      <BulkImport tags={tags} />
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────

function CategorySlugCell({ row }: AdminCellSlotProps<CustomTagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

function CategoryLabelCell({ row }: AdminCellSlotProps<CustomTagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span>{row.label}</span>;
}

function CategoryDescriptionCell({ row }: AdminCellSlotProps<CustomTagCategoryResponse>) {
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

function CategoryTagCountCell({ row }: AdminCellSlotProps<CustomTagCategoryResponse>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.tagCount}</span>;
}

function CategorySlugAddInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagCategoryDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
      placeholder="region"
      className="h-8 w-48 font-mono"
    />
  );
}

function CategoryLabelInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagCategoryDraft>) {
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

function CategoryLabelAddInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagCategoryDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
      placeholder="Region"
      className="h-8"
    />
  );
}

function CategoryDescriptionInput({
  draft,
  setDraft,
}: AdminDraftSlotProps<CustomTagCategoryDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="Optional description"
      className="h-8"
    />
  );
}

const categoryColumns: AdminColumnDef<CustomTagCategoryResponse, CustomTagCategoryDraft>[] = [
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
    addCell: <CategoryLabelAddInput />,
  },
  {
    header: "Description",
    sortValue: (cat) => cat.description ?? "",
    cell: <CategoryDescriptionCell />,
    editCell: <CategoryDescriptionInput />,
    addCell: <CategoryDescriptionInput />,
  },
  {
    header: "Tags",
    sortValue: (cat) => cat.tagCount,
    align: "right",
    cell: <CategoryTagCountCell />,
  },
];

function CategoriesSection({ categories }: { categories: CustomTagCategoryResponse[] }) {
  const createMutation = useCreateCustomTagCategory();
  const updateMutation = useUpdateCustomTagCategory();
  const deleteMutation = useDeleteCustomTagCategory();

  return (
    <AdminTable
      columns={categoryColumns}
      data={categories}
      getRowKey={(cat) => cat.id}
      emptyText="No categories yet — create one before adding tags."
      toolbar={
        <p className="text-muted-foreground">
          Categories namespace custom tags so each deck-builder format only sees its own vocabulary.
          Delete is blocked while tags still reference the category.
        </p>
      }
      add={{
        emptyDraft: { id: "", slug: "", label: "", description: "" },
        onSave: (d) =>
          createMutation.mutateAsync({
            slug: d.slug.trim(),
            label: d.label.trim(),
            description: d.description.trim() || null,
          }),
        validate: (d) => {
          const slug = d.slug.trim();
          const label = d.label.trim();
          if (!slug || !label) {
            return "Slug and label are required";
          }
          if (!isValidSlug(slug)) {
            return "Slug must be kebab-case (e.g. region)";
          }
          return null;
        },
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

// ── Tags ──────────────────────────────────────────────────────────────────

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

function TagDescriptionInput({ draft, setDraft }: AdminDraftSlotProps<CustomTagDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder="Optional description"
      className="h-8"
    />
  );
}

function TagsSection({
  tags,
  categories,
}: {
  tags: CustomTagResponse[];
  categories: CustomTagCategoryResponse[];
}) {
  const createMutation = useCreateCustomTag();
  const updateMutation = useUpdateCustomTag();
  const deleteMutation = useDeleteCustomTag();

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
      editCell: <TagDescriptionInput />,
      addCell: <TagDescriptionInput />,
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
    />
  );
}

function CategorySelect({
  items,
  value,
  onChange,
}: {
  items: { value: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onChange(next);
        }
      }}
    >
      <SelectTrigger className="h-8 w-40" aria-label="Category">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// ── Card tag editor ───────────────────────────────────────────────────────

function CardTagEditor({ tags }: { tags: CustomTagResponse[] }) {
  const { data: allCards } = useAllCards();
  const [search, setSearch] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const searchResults: CardSearchResult[] =
    search.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.id, label: c.name, sublabel: c.slug, detail: c.type }))
      : [];

  const selectedCard = selectedCardId ? allCards.find((c) => c.id === selectedCardId) : undefined;

  return (
    <section className="space-y-4 rounded-md border p-4">
      <div>
        <Heading level={2} as="h3">
          Assign tags to a card
        </Heading>
        <p className="text-muted-foreground text-sm">
          Search for a card, then toggle which custom tags it carries.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Card</Label>
        <CardSearchDropdown
          results={searchResults}
          onSearch={(q) => {
            setSearch(q);
            setSelectedCardId(null);
          }}
          onSelect={(id) => setSelectedCardId(id)}
          placeholder="Search by name…"
          className="w-80"
        />
      </div>

      {selectedCard ? (
        <CardTagToggleList
          key={selectedCard.id}
          cardId={selectedCard.id}
          cardName={selectedCard.name}
          tags={tags}
        />
      ) : (
        <p className="text-muted-foreground text-sm">No card selected.</p>
      )}
    </section>
  );
}

// ── Bulk import ───────────────────────────────────────────────────────────

function BulkImport({ tags }: { tags: CustomTagResponse[] }) {
  const { data: allCards } = useAllCards();
  const mutation = useAddCardsToCustomTag();
  const [tagId, setTagId] = useState<string>(tags[0]?.id ?? "");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{
    added: number;
    matched: number;
    tagLabel: string;
  } | null>(null);

  const plan: BulkImportPlan = useMemo(
    () => planCustomTagBulkImport(text, allCards),
    [text, allCards],
  );

  const selectedTag = tags.find((t) => t.id === tagId);
  const canImport = selectedTag !== undefined && plan.cardIds.length > 0 && !mutation.isPending;

  // Group tags by category label for the select so the admin can find the
  // right one even when several formats share the dropdown.
  const tagsByCategory = Map.groupBy(tags, (t) => t.categoryLabel);
  const tagItems = tags.map((tag) => ({ value: tag.id, label: tag.label }));

  async function handleImport() {
    if (!selectedTag) {
      return;
    }
    const matchedCount = plan.cardIds.length;
    const response = await mutation.mutateAsync({ tagId: selectedTag.id, cardIds: plan.cardIds });
    setResult({ added: response.added, matched: matchedCount, tagLabel: selectedTag.label });
    setText("");
  }

  if (tags.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-md border p-4">
      <div>
        <Heading level={2} as="h3">
          Bulk import
        </Heading>
        <p className="text-muted-foreground text-sm">
          Paste a decklist-style block (one card per line, optionally prefixed by a count) and
          attach the selected tag to every matched card. Re-importing is safe — cards already
          carrying the tag are left untouched.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="bulk-import-tag">Tag</Label>
          <Select
            items={tagItems}
            value={tagId}
            onValueChange={(next) => {
              if (next !== null) {
                setTagId(next);
                setResult(null);
              }
            }}
          >
            <SelectTrigger id="bulk-import-tag" className="h-8 w-40" aria-label="Tag">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[...tagsByCategory.entries()].map(([categoryLabel, group]) => (
                <SelectGroup key={categoryLabel}>
                  <SelectLabel>{categoryLabel}</SelectLabel>
                  {group.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="bulk-import-text">Cards</Label>
        <Textarea
          id="bulk-import-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          placeholder={"1 Brazen Buccaneer\n1 Riptide Rex\n1 Bilgewater Bully"}
          rows={10}
          className="font-mono text-sm"
        />
      </div>

      <BulkImportPreview plan={plan} />

      <div className="flex items-center gap-3">
        <Button disabled={!canImport} onClick={handleImport}>
          {mutation.isPending
            ? "Importing…"
            : `Import ${plan.cardIds.length} card${plan.cardIds.length === 1 ? "" : "s"}`}
        </Button>
        {result && (
          <p className="text-sm">
            Added <span className="font-semibold">{result.added}</span> of {result.matched} matched
            card{result.matched === 1 ? "" : "s"} to{" "}
            <span className="font-semibold">{result.tagLabel}</span>
            {result.added < result.matched && (
              <span className="text-muted-foreground">
                {" "}
                ({result.matched - result.added} already tagged)
              </span>
            )}
            .
          </p>
        )}
      </div>
    </section>
  );
}

function BulkImportPreview({ plan }: { plan: BulkImportPlan }) {
  if (
    plan.matched.length === 0 &&
    plan.unmatched.length === 0 &&
    plan.ambiguous.length === 0 &&
    plan.warnings.length === 0
  ) {
    return null;
  }
  return (
    <div className="space-y-2 text-sm">
      <p>
        Matched <span className="font-semibold">{plan.matched.length}</span> card
        {plan.matched.length === 1 ? "" : "s"}.
      </p>
      {plan.unmatched.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">
            Unmatched: {plan.unmatched.length} name{plan.unmatched.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.unmatched.map((name, i) => (
              <li key={`${name}-${i}`} className="font-mono">
                {name}
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.ambiguous.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">
            Ambiguous: {plan.ambiguous.length} name
            {plan.ambiguous.length === 1 ? "" : "s"} (skipped)
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.ambiguous.map((a, i) => (
              <li key={`${a.name}-${i}`} className="font-mono">
                {a.name} ({a.matches.length} matches)
              </li>
            ))}
          </ul>
        </details>
      )}
      {plan.warnings.length > 0 && (
        <details className="text-muted-foreground">
          <summary className="cursor-pointer">Skipped lines: {plan.warnings.length}</summary>
          <ul className="mt-1 list-disc pl-5">
            {plan.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CardTagToggleList({
  cardId,
  cardName,
  tags,
}: {
  cardId: string;
  cardName: string;
  tags: CustomTagResponse[];
}) {
  const { data } = useCardCustomTags(cardId);
  const mutation = useSetCardCustomTags(cardId);
  const [pending, setPending] = useState<Set<string>>(new Set(data.customTagIds));

  function toggle(tagId: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }

  async function save() {
    await mutation.mutateAsync([...pending]);
  }

  const dirty =
    pending.size !== data.customTagIds.length ||
    [...pending].some((id) => !data.customTagIds.includes(id));

  const tagsByCategory = Map.groupBy(tags, (t) => t.categoryLabel);

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{cardName}</p>
      {[...tagsByCategory.entries()].map(([categoryLabel, group]) => (
        <div key={categoryLabel} className="space-y-1">
          <p className="text-muted-foreground font-mono text-xs uppercase">{categoryLabel}</p>
          <div className="flex flex-wrap gap-2">
            {group.map((tag) => {
              const active = pending.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className={
                    active
                      ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 rounded-full px-3 py-1 text-sm"
                  }
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {tags.length === 0 && (
        <p className="text-muted-foreground text-sm">No tags exist yet — create one above.</p>
      )}
      <Button disabled={!dirty || mutation.isPending} onClick={save}>
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
