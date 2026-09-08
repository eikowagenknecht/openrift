import { Loader2Icon, WandSparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";

import type { UnifiedMappingPrinting } from "@/features/admin/lib/price-mappings-types";
import { cn } from "@/lib/utils";

import { PrintingLabel } from "./marketplace-printing-label";
import type { ProductSuggestion } from "./suggest-mapping";
import { STRONG_MATCH_THRESHOLD } from "./suggest-mapping";

export function SuggestionChip({
  suggestion,
  productExternalId,
  highlightFinish,
  highlightLanguage,
  highlightMarkers,
  onAssign,
  disabled,
}: {
  suggestion: ProductSuggestion & { printing: UnifiedMappingPrinting };
  productExternalId: number;
  highlightFinish?: string;
  highlightLanguage?: string;
  highlightMarkers?: boolean;
  onAssign: (externalId: number, printingId: string) => void;
  disabled: boolean;
}) {
  const { printing } = suggestion;
  const isWeak = suggestion.isWeak === true;
  const isStrong = !isWeak && suggestion.score >= STRONG_MATCH_THRESHOLD;
  // The parent's `disabled` transitions later and is shared across every chip in
  // the marketplace, so this local flag gives the clicked chip synchronous feedback.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) {
      return;
    }
    const handle = globalThis.setTimeout(() => setPending(false), 5000);
    return () => globalThis.clearTimeout(handle);
  }, [pending]);
  const busy = pending || disabled;
  const tooltip = isWeak
    ? "Accept weak suggestion (mirrors a sibling SKU's mapping)"
    : `Accept suggestion (score ${suggestion.score})`;
  return (
    // oxlint-disable-next-line react/forbid-elements -- semantic green/amber suggestion pill; no Button variant carries these colors
    <button
      type="button"
      title={tooltip}
      disabled={busy}
      onClick={() => {
        setPending(true);
        onAssign(productExternalId, printing.printingId);
      }}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-4xl border px-2 py-0.5 text-xs font-medium disabled:opacity-50",
        isStrong &&
          "border-success/30 bg-success-soft text-success hover:bg-success/20 border-solid",
        !isStrong &&
          !isWeak &&
          "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 border-dashed",
        isWeak &&
          "border-warning/40 bg-warning-soft text-warning hover:bg-warning/20 border-dashed",
      )}
    >
      {pending ? (
        <Loader2Icon className="size-3 shrink-0 animate-spin" />
      ) : (
        <WandSparklesIcon className="size-3 shrink-0" />
      )}
      <PrintingLabel
        printing={printing}
        highlightFinish={highlightFinish}
        highlightLanguage={highlightLanguage}
        highlightMarkers={highlightMarkers}
      />
    </button>
  );
}
