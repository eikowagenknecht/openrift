import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { buildTranslationReverseMap } from "@/lib/keywords";

/**
 * Builds a reverse map from translated keyword labels (lowercased) to their
 * canonical English keyword name, for cross-language keyword search.
 *
 * @returns A Map from translated label to canonical keyword name.
 */
export function useKeywordReverseMap(): Map<string, string> {
  "use memo";
  const styles = useKeywordStyles();
  return buildTranslationReverseMap(styles);
}
