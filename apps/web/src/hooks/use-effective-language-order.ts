import { useLanguageList } from "@/hooks/use-enums";
import { useDisplayStore } from "@/stores/display-store";

/**
 * Compose the user's effective language sort order. Returns the user's
 * preference list when set, otherwise the DB-driven default from
 * `languages.sort_order` (via `/api/enums`). Pair with `canonicalRank` to
 * sort printings correctly for both authenticated and logged-out users.
 *
 * @returns Ordered language codes, user preference taking priority over the DB default.
 */
export function useEffectiveLanguageOrder(): readonly string[] {
  const userLanguages = useDisplayStore((s) => s.languages);
  const defaultLanguages = useLanguageList().map((l) => l.code);
  return userLanguages.length > 0 ? userLanguages : defaultLanguages;
}

/**
 * Non-hook variant for route loaders, server functions, and other contexts
 * that can't call hooks. Callers pass both the user preference list and the
 * raw language rows from `/api/init` (already fetched via `ensureQueryData`
 * on `initQueryOptions`).
 *
 * @returns Ordered language codes, user preference taking priority over the DB default.
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
