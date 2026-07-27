import type { AdminDraftSlotProps } from "@/components/admin/admin-table";
import { Input } from "@/components/ui/input";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { isValidSlug } from "@/lib/admin-slug";

// Pieces shared verbatim across the admin CRUD pages (art variants, domains,
// card tags, custom tags, distribution channels). Kept to exact duplicates
// found across those pages — not a general-purpose admin-form kit.

/**
 * Plain label text input, shared by pages with no add-only placeholder for it.
 *
 * @returns The label input, or null while there is no active draft.
 */
export function LabelInput<TDraft extends { label: string }>({
  draft,
  setDraft,
}: AdminDraftSlotProps<TDraft>) {
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

/**
 * Optional description text input, shared by the card-tags and custom-tags category sections.
 *
 * @returns The description input, or null while there is no active draft.
 */
export function CategoryDescriptionInput<TDraft extends { description: string }>({
  draft,
  setDraft,
}: AdminDraftSlotProps<TDraft>) {
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

/**
 * Rendered options for a category-style Select's dropdown content.
 *
 * @returns The select's content (grouped options).
 */
export function CategorySelectOptions({ items }: { items: { value: string; label: string }[] }) {
  return (
    <SelectContent>
      <SelectGroup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  );
}

/**
 * Shared "required slug + label, slug must be kebab-case" validation used by
 * every admin CRUD page's add/edit draft.
 *
 * @returns An error string to block save, or null when the draft is valid.
 */
export function validateSlugAndLabel(slug: string, label: string, example: string): string | null {
  const trimmedSlug = slug.trim();
  const trimmedLabel = label.trim();
  if (!trimmedSlug || !trimmedLabel) {
    return "Slug and label are required";
  }
  if (!isValidSlug(trimmedSlug)) {
    return `Slug must be kebab-case (e.g. ${example})`;
  }
  return null;
}
