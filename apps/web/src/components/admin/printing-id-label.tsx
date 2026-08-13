import { LanguageChip } from "@/components/language-chip";
import { cn } from "@/lib/utils";

/**
 * A printing's expected id (`EN:OGN-001::foil`) with the language prefix shown
 * as the colored language chip instead of a leading `EN:` segment, so the
 * language is glanceable down a list of printings.
 *
 * Labels that carry no language prefix (or whose prefix doesn't match the
 * printing's language) render unchanged.
 *
 * @returns The label, with its language segment chipped when present.
 */
export function PrintingIdLabel({
  label,
  language,
  className,
}: {
  label: string;
  language?: string | null;
  className?: string;
}) {
  if (!language || !label.startsWith(`${language}:`)) {
    return <span className={className}>{label}</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <LanguageChip code={language} />
      <span>{label.slice(language.length + 1)}</span>
    </span>
  );
}
