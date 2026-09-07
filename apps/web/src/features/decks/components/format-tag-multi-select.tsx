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
  category: string;
  nounPlural: string;
  selected: string[];
  onChange: (next: string[]) => void;
  triggerId: string;
  triggerClassName?: string;
}

/** State for "empty category" is left to the caller — render a fallback above this before mounting it. */
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

export function useCategoryTagSlugs(category: string): string[] {
  const { byCategory } = useCustomTagList();
  return (byCategory.get(category) ?? []).map((tag) => tag.slug);
}
