import { Badge } from "@/components/ui/badge";
import { useLanguageColors, useLanguageLabels } from "@/hooks/use-enums";
import { contrastText } from "@/lib/color";
import { cn } from "@/lib/utils";

export const LANGUAGE_CHIP_FALLBACK_COLOR = "#6a6a6a";

export function languageChipStyle(color: string | null): {
  backgroundColor: string;
  color: string;
} {
  const bg = color ?? LANGUAGE_CHIP_FALLBACK_COLOR;
  return { backgroundColor: bg, color: contrastText(bg) };
}

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
