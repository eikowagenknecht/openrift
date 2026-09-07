import { useKeywordStyles } from "@/hooks/use-keyword-styles";
import { buildTranslationReverseMap } from "@/lib/keywords";

export function useKeywordReverseMap(): Map<string, string> {
  "use memo";
  const styles = useKeywordStyles();
  return buildTranslationReverseMap(styles);
}
