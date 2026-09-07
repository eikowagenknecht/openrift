import type { AdminCellSlotProps, AdminDraftSlotProps } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { isValidSlug } from "@/lib/admin-slug";
import { contrastText } from "@/lib/color";
import { cn } from "@/lib/utils";

// Kept to exact duplicates found across the admin CRUD pages, not a
// general-purpose admin-form kit. Each slot is generic over the row/draft
// shape, so a page passes its own type: <SlugCell<FinishRow> />.

export function SlugCell<TRow extends { slug: string }>({ row }: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.slug}</span>;
}

export function LabelCell<TRow extends { label: string }>({ row }: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-sm">{row.label}</span>;
}

export function WellKnownCell<TRow extends { isWellKnown: boolean }>({
  row,
}: AdminCellSlotProps<TRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.isWellKnown ? "Yes" : "No"}</span>;
}

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
      <span
        className="inline-block size-4 rounded-md border"
        style={{ backgroundColor: row.color }}
      />
      <span className="font-mono text-sm">{row.color}</span>
    </div>
  );
}

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
  width?: string;
}

// Every taxonomy slug is kebab-case, so typing is lowercased as it goes in.
export function SlugAddInput<TDraft extends { slug: string }>({
  draft,
  setDraft,
  placeholder,
  width = "w-40",
}: SlugAddInputProps<TDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.slug}
      onChange={(event) =>
        setDraft((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))
      }
      placeholder={placeholder}
      className={cn("h-8 font-mono", width)}
    />
  );
}

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

export function validateSlugAndLabel(slug: string, label: string, example: string): string | null {
  if (!slug.trim() || !label.trim()) {
    return "Slug and label are required";
  }
  if (!isValidSlug(slug.trim())) {
    return `Slug must be kebab-case (e.g. ${example})`;
  }
  return null;
}

// An empty value is valid: the color column is nullable everywhere.
export function validateHexColor(color: string, example: string): string | null {
  const trimmed = color.trim();
  if (trimmed && !/^#[0-9a-fA-F]{6}$/u.test(trimmed)) {
    return `Color must be a hex code (e.g. ${example})`;
  }
  return null;
}
