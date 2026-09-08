import { WellKnown } from "@openrift/shared/well-known";

import type { UnifiedMappingPrinting } from "@/features/admin/lib/price-mappings-types";

export function PrintingLabel({
  printing,
  highlightFinish,
  highlightLanguage,
  highlightMarkers,
}: {
  printing: Pick<
    UnifiedMappingPrinting,
    "shortCode" | "markerSlugs" | "finish" | "language" | "size"
  >;
  highlightFinish?: string;
  highlightLanguage?: string;
  highlightMarkers?: boolean;
}) {
  const langMatches = highlightLanguage !== undefined && printing.language === highlightLanguage;
  const finishMatches = highlightFinish !== undefined && printing.finish === highlightFinish;
  const matchCls = "underline decoration-2 underline-offset-2";
  const isOversized = printing.size !== WellKnown.cardSize.STANDARD;
  return (
    <span>
      {printing.language && (
        <>
          <span className={langMatches ? matchCls : undefined}>{printing.language}</span>:
        </>
      )}
      {printing.shortCode}:
      <span className={highlightMarkers ? matchCls : undefined}>
        {printing.markerSlugs.join("+")}
      </span>
      :<span className={finishMatches ? matchCls : undefined}>{printing.finish}</span>
      {isOversized && <span className="text-warning">:{printing.size}</span>}
    </span>
  );
}
