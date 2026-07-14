import { Badge } from "@/components/ui/badge";
import { useLanguageColors, useLanguageLabels } from "@/hooks/use-enums";
import { contrastText } from "@/lib/color";
import { cn } from "@/lib/utils";

/** Neutral fallback fill for languages with no color set (mirrors the keyword fallback). */
export const LANGUAGE_CHIP_FALLBACK_COLOR = "#6a6a6a";

/**
 * Inline style for a language chip: the stored (or fallback) hex as the fill,
 * with a WCAG-contrast foreground. Pure so it can be unit-tested without hooks.
 *
 * @returns A style object with `backgroundColor` and a readable `color`.
 */
export function languageChipStyle(color: string | null): {
  backgroundColor: string;
  color: string;
} {
  const bg = color ?? LANGUAGE_CHIP_FALLBACK_COLOR;
  return { backgroundColor: bg, color: contrastText(bg) };
}

/**
 * A colored, glanceable chip for a printing's language code (e.g. a blue "EN").
 * Colors are admin-managed in the languages taxonomy; the full language name is
 * exposed via the chip's title for hover and assistive tech. The code text stays
 * on the chip so color is a redundant, not sole, encoding.
 *
 * @returns A Badge showing the language code, tinted by its configured color.
 */
export function LanguageChip({ code, className }: { code: string; className?: string }) {
  const colors = useLanguageColors();
  const labels = useLanguageLabels();
  return (
    <Badge
      className={cn("text-2xs h-4 gap-0.5 px-1.5 font-mono", className)}
      style={languageChipStyle(colors[code] ?? null)}
      title={labels[code] ?? code}
    >
      {code}
    </Badge>
  );
}
