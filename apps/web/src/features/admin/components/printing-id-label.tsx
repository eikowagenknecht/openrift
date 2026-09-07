import { LanguageChip } from "@/components/language-chip";
import { cn } from "@/lib/utils";

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
