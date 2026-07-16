import { useCustomTagList } from "@/hooks/use-enums";
import { regionLabelFromTags } from "@/lib/region-overview";

/**
 * Region slug -> display label, from the admin-curated `region` custom-tag
 * category (the same vocabulary Custom - Region decks use).
 *
 * @returns The label lookup function.
 */
export function useRegionLabel(): (slug: string) => string {
  const { byCategory } = useCustomTagList();
  return regionLabelFromTags(byCategory.get("region") ?? []);
}
