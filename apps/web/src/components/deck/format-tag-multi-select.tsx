import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { useCustomTagList } from "@/hooks/use-enums";
import { cn } from "@/lib/utils";

interface TagMultiSelectProps {
  /** `custom_tags.category` whose slugs are offered (e.g. "region"). */
  category: string;
  /** Plural display noun, e.g. "regions". Drives placeholder/empty copy. */
  nounPlural: string;
  /** Currently selected slugs. Controlled by the parent. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** DOM id for the trigger (pair with an external `<Label htmlFor>`). */
  triggerId: string;
  /** Optional override for the trigger's width/style — defaults to a 18rem fixed width. */
  triggerClassName?: string;
}

/**
 * Multi-select dropdown over a single custom-tag category. Used by the
 * format-tag picker banner and the change-tags dialog — both pick zero or
 * more slugs from the same category. The list of tags comes from
 * `useCustomTagList`, so the picker stays in sync with the admin vocabulary.
 *
 * The component is purely controlled: callers own `selected` and react to
 * `onChange`. State for "empty category" (admin hasn't created any tags
 * yet) is left to the caller — render a fallback above this component
 * before mounting it.
 *
 * @returns The combobox. Render-only; no side effects.
 */
export function TagMultiSelect({
  category,
  nounPlural,
  selected,
  onChange,
  triggerId,
  triggerClassName,
}: TagMultiSelectProps) {
  const { byCategory } = useCustomTagList();
  const tags = byCategory.get(category) ?? [];
  const slugs = tags.map((tag) => tag.slug);
  const labelMap = new Map(tags.map((tag) => [tag.slug, tag.label] as const));
  const labelFor = (slug: string) => labelMap.get(slug) ?? slug;
  const triggerText =
    selected.length === 0
      ? `Pick ${nounPlural}…`
      : selected.map((slug) => labelFor(slug)).join(" + ");

  return (
    <Combobox<string, true>
      multiple
      items={slugs}
      value={selected}
      onValueChange={onChange}
      itemToStringLabel={labelFor}
    >
      <ComboboxTrigger
        id={triggerId}
        className={cn(
          "border-input bg-background hover:bg-muted/50 flex h-9 items-center justify-between rounded-md border px-3 text-sm",
          triggerClassName ?? "w-72",
        )}
      >
        <span className={selected.length === 0 ? "text-muted-foreground" : ""}>{triggerText}</span>
      </ComboboxTrigger>
      <ComboboxContent className="w-(--anchor-width) min-w-72">
        <ComboboxInput placeholder={`Search ${nounPlural}…`} showTrigger={false} />
        <ComboboxEmpty>No matching {nounPlural}.</ComboboxEmpty>
        <ComboboxList>
          {(slug: string) => (
            <ComboboxItem key={slug} value={slug}>
              {labelFor(slug)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * @returns The slugs in a category. Convenience for callers that need to
 *   know whether any tags exist before mounting {@link TagMultiSelect}.
 */
export function useCategoryTagSlugs(category: string): string[] {
  const { byCategory } = useCustomTagList();
  return (byCategory.get(category) ?? []).map((tag) => tag.slug);
}
