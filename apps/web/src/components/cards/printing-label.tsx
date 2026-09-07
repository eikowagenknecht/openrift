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
 * Renders label pieces inline, separated by a muted middot. The language chip
 * is followed by a plain gap instead, with no separator.
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

export function PrintingVariantLabel({
  printing,
  siblings,
  code,
  fallback = "Standard",
  className,
}: {
  printing: VariantLabelPrinting;
  siblings?: readonly VariantLabelPrinting[];
  code?: ReactNode;
  fallback?: string;
  className?: string;
}): ReactNode {
  const { labels } = useEnumOrders();
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, labels);
  const isPlain = !language && rest.length === 0;
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

/** Display form of {@link formatImportPrintingLabelParts} for import/search rows. */
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
