import type { Printing, VariantLabelPrinting } from "@openrift/shared";
import { formatPrintingVariantLabelParts } from "@openrift/shared";
import type { ReactNode } from "react";

import { LanguageChip } from "@/components/language-chip";
import { useEnumOrders } from "@/hooks/use-enums";
import { formatImportPrintingLabelParts } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LabelPiece {
  key: string;
  node: ReactNode;
  /** The language chip: no middot separator is drawn directly after it. */
  chip?: boolean;
}

/**
 * Renders label pieces inline, separated by a muted middot — except the language
 * chip, which is followed by a plain gap so it reads as a distinct leading mark
 * rather than another dotted attribute.
 *
 * @returns The inline dotted label.
 */
function DottedLabel({ pieces, className }: { pieces: LabelPiece[]; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 align-middle", className)}>
      {pieces.map((piece, index) => (
        <span key={piece.key} className="inline-flex items-center gap-1">
          {index > 0 && !pieces[index - 1].chip && (
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
          )}
          {piece.node}
        </span>
      ))}
    </span>
  );
}

/**
 * Display form of {@link formatPrintingVariantLabel}: the language renders as a colored
 * chip instead of a `[XX]` tag. The chip is always the first entry of the row,
 * so an optional `code` slot (the shortcode, rendered by the caller so it can
 * carry a link) lands after the chip, then the remaining variant labels. Falls
 * back to `fallback` (default "Standard") when a printing has no distinguishing
 * attributes — after the code, so a plain row reads e.g. "OGN-021 · Standard".
 *
 * @returns The inline variant label with a leading language chip.
 */
export function PrintingVariantLabel({
  printing,
  siblings,
  code,
  fallback = "Standard",
  className,
}: {
  // Structural, like `formatPrintingVariantLabelParts` itself: the catalog's
  // `Printing` satisfies it, and so does a form's in-progress printing.
  printing: VariantLabelPrinting;
  siblings?: readonly VariantLabelPrinting[];
  code?: ReactNode;
  fallback?: string;
  className?: string;
}): ReactNode {
  const { labels } = useEnumOrders();
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, labels);
  const isPlain = !language && rest.length === 0;
  // No code slot and nothing to distinguish: the bare fallback word.
  if (isPlain && code === undefined) {
    return fallback;
  }
  const pieces: LabelPiece[] = [];
  if (language) {
    pieces.push({ key: "lang", node: <LanguageChip code={language} />, chip: true });
  }
  if (code !== undefined) {
    pieces.push({ key: "code", node: code });
  }
  for (const part of rest) {
    pieces.push({ key: part, node: part });
  }
  if (isPlain) {
    pieces.push({ key: "fallback", node: fallback });
  }
  return <DottedLabel pieces={pieces} className={className} />;
}

/**
 * Display form of {@link formatImportPrintingLabel} for import/search rows. The
 * language chip leads (first entry of the row), then the card ID, then the
 * variant labels.
 *
 * @returns The inline import label with a leading language chip.
 */
export function ImportPrintingLabel({
  printing,
  className,
}: {
  printing: Printing;
  className?: string;
}): ReactNode {
  const { labels } = useEnumOrders();
  const { code, language, rest } = formatImportPrintingLabelParts(printing, labels);
  const pieces: LabelPiece[] = [];
  if (language) {
    pieces.push({ key: "lang", node: <LanguageChip code={language} />, chip: true });
  }
  pieces.push({ key: "code", node: <span className="font-mono">{code}</span> });
  for (const part of rest) {
    pieces.push({ key: part, node: part });
  }
  return <DottedLabel pieces={pieces} className={className} />;
}
