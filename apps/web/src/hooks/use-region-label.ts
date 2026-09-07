import { useCustomTagList } from "@/hooks/use-enums";
import { regionLabelFromTags } from "@/lib/region-overview";

/** Looks up display labels from the admin-curated `region` custom-tag category. */
export function useRegionLabel(): (slug: string) => string {
  const { byCategory } = useCustomTagList();
  return regionLabelFromTags(byCategory.get("region") ?? []);
}
