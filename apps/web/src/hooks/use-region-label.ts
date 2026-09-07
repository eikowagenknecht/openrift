import { regionLabelFromTags } from "@/features/tournaments/lib/region-overview";
import { useCustomTagList } from "@/hooks/use-enums";

/** Looks up display labels from the admin-curated `region` custom-tag category. */
export function useRegionLabel(): (slug: string) => string {
  const { byCategory } = useCustomTagList();
  return regionLabelFromTags(byCategory.get("region") ?? []);
}
