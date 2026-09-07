import { useLanguageList } from "@/hooks/use-enums";
import { useDisplayStore } from "@/stores/display-store";

/** Pair with `canonicalRank` to sort printings for both authenticated and logged-out users. */
export function useEffectiveLanguageOrder(): readonly string[] {
  const userLanguages = useDisplayStore((s) => s.languages);
  const defaultLanguages = useLanguageList().map((l) => l.code);
  return userLanguages.length > 0 ? userLanguages : defaultLanguages;
}

/**
 * Non-hook variant of {@link useEffectiveLanguageOrder} for route loaders,
 * server functions, and other contexts that can't call hooks.
 */
export function effectiveLanguageOrder(
  userLanguages: readonly string[],
  defaultLanguageRows: readonly { slug: string; sortOrder: number }[],
): readonly string[] {
  if (userLanguages.length > 0) {
    return userLanguages;
  }
  return defaultLanguageRows.toSorted((a, b) => a.sortOrder - b.sortOrder).map((row) => row.slug);
}
