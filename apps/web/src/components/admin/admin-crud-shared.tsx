import type { AdminCellSlotProps, AdminDraftSlotProps } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { isValidSlug } from "@/lib/admin-slug";
import { contrastText } from "@/lib/color";
import { cn } from "@/lib/utils";

// Pieces shared verbatim across the admin CRUD pages (card types, finishes,
// super types, deck formats, deck zones, art variants, rarities, domains,
// markers, distribution channels, languages, card tags, custom tags). Kept to
// exact duplicates found across those pages — not a general-purpose admin-form
// kit. Each slot is generic over the row/draft shape, so a page passes its own
// type: <SlugCell<FinishRow> />.

/**
 * Monospaced slug display cell.
 *
 * @returns The slug, or null while there is no row.
 */
export function SlugCell<TRow extends { slug: string }>({ row }: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

/**
 * Plain label display cell.
 *
 * @returns The label, or null while there is no row.
 */
export function LabelCell<TRow extends { label: string }>({ row }: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

/**
 * Yes/no cell for the well-known flag on the seeded taxonomy tables.
 *
 * @returns The flag as Yes/No, or null while there is no row.
 */
export function WellKnownCell<TRow extends { isWellKnown: boolean }>({
  row,
}: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

/**
 * Truncated description cell with the full text as a tooltip.
 *
 * @returns The description, an em dash when empty, or null while there is no row.
 */
export function DescriptionCell<TRow extends { description: string | null }>({
  row,
}: AdminCellSlotProps<TRow>) {
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

/**
 * Color swatch plus hex code.
 *
 * @returns The swatch and hex code, a dash when unset, or null while there is no row.
 */
export function ColorCell<TRow extends { color: string | null }>({
  row,
}: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  if (!row.color) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block size-4 rounded border" style={{ backgroundColor: row.color }} />
      <span className="font-mono text-sm">{row.color}</span>
    </div>
  );
}

/**
 * Badge preview of a row rendered in its own color, as it appears elsewhere in the UI.
 *
 * @returns The preview badge, or null while there is no row.
 */
export function ColorPreviewCell<TRow extends { label: string; color: string | null }>({
  row,
}: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return (
    <Badge
      style={row.color ? { backgroundColor: row.color, color: contrastText(row.color) } : undefined}
      variant={row.color ? "default" : "secondary"}
    >
      {row.label}
    </Badge>
  );
}

interface SlugAddInputProps<TDraft extends { slug: string }> extends AdminDraftSlotProps<TDraft> {
  placeholder: string;
  /** Slugs are kebab-case by default; pages that keep PascalCase slugs pass false. */
  lowercase?: boolean;
  /** Tailwind width class for the input. */
  width?: string;
}

/**
 * Monospaced slug text input for the add row, and for edit on the pages that allow
 * renaming a slug.
 *
 * @returns The slug input, or null while there is no active draft.
 */
export function SlugAddInput<TDraft extends { slug: string }>({
  draft,
  setDraft,
  placeholder,
  lowercase = true,
  width = "w-40",
}: SlugAddInputProps<TDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({
          ...prev,
          slug: lowercase ? event.target.value.toLowerCase() : event.target.value,
        }))
      }
      placeholder={placeholder}
      className={cn("h-8 font-mono", width)}
    />
  );
}

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

interface LabelAddInputProps<TDraft extends { label: string }> extends AdminDraftSlotProps<TDraft> {
  placeholder: string;
}

/**
 * Label text input for the add row, where an example label is shown as the placeholder.
 *
 * @returns The label input, or null while there is no active draft.
 */
export function LabelAddInput<TDraft extends { label: string }>({
  draft,
  setDraft,
  placeholder,
}: LabelAddInputProps<TDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.label}
      onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
      placeholder={placeholder}
      className="h-8"
    />
  );
}

interface DescriptionInputProps<
  TDraft extends { description: string },
> extends AdminDraftSlotProps<TDraft> {
  placeholder?: string;
}

/**
 * Optional description text input.
 *
 * @returns The description input, or null while there is no active draft.
 */
export function DescriptionInput<TDraft extends { description: string }>({
  draft,
  setDraft,
  placeholder = "Optional description",
}: DescriptionInputProps<TDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.description}
      onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
      placeholder={placeholder}
      className="h-8"
    />
  );
}

interface ColorInputProps<TDraft extends { color: string }> extends AdminDraftSlotProps<TDraft> {
  placeholder: string;
}

/**
 * Hex color text input.
 *
 * @returns The color input, or null while there is no active draft.
 */
export function ColorInput<TDraft extends { color: string }>({
  draft,
  setDraft,
  placeholder,
}: ColorInputProps<TDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.color}
      onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
      placeholder={placeholder}
      className="h-8 w-28 font-mono"
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
 * Both fields are required on every admin CRUD page. Split out of
 * {@link validateSlugAndLabel} for the pages whose slugs are deliberately not
 * kebab-case (rarities and domains keep PascalCase slugs).
 *
 * @returns An error string to block save, or null when both fields are filled.
 */
export function validateRequiredSlugAndLabel(slug: string, label: string): string | null {
  if (!slug.trim() || !label.trim()) {
    return "Slug and label are required";
  }
  return null;
}

/**
 * Shared "required slug + label, slug must be kebab-case" validation used by
 * every admin CRUD page's add/edit draft.
 *
 * @returns An error string to block save, or null when the draft is valid.
 */
export function validateSlugAndLabel(slug: string, label: string, example: string): string | null {
  const required = validateRequiredSlugAndLabel(slug, label);
  if (required) {
    return required;
  }
  if (!isValidSlug(slug.trim())) {
    return `Slug must be kebab-case (e.g. ${example})`;
  }
  return null;
}

/**
 * Shared hex-color validation for the admin CRUD pages that store a color.
 * An empty value is valid, since the column is nullable everywhere.
 *
 * @returns An error string to block save, or null when the color is valid or empty.
 */
export function validateHexColor(color: string, example: string): string | null {
  const trimmed = color.trim();
  if (trimmed && !/^#[0-9a-fA-F]{6}$/u.test(trimmed)) {
    return `Color must be a hex code (e.g. ${example})`;
  }
  return null;
}
