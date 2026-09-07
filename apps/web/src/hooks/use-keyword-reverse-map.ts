import { buildTranslationReverseMap } from "@/features/cards/lib/keywords";
import { useKeywordStyles } from "@/hooks/use-keyword-styles";

export function useKeywordReverseMap(): Map<string, string> {
  "use memo";
  const styles = useKeywordStyles();
  return buildTranslationReverseMap(styles);
}
