import type { CandidateCardSummaryResponse } from "@openrift/shared";
import { formatShortCodesArray } from "@openrift/shared/utils";

export function PrintingsCell({ row }: { row: CandidateCardSummaryResponse }) {
  const shortCodes = formatShortCodesArray(row.shortCodes);
  const stagingCodes = formatShortCodesArray(row.stagingShortCodes);

  return (
    <span>
      {shortCodes.map((code, index) => (
        <span key={code} className="text-muted-foreground">
          {code}
          {(index < shortCodes.length - 1 || stagingCodes.length > 0) && ", "}
        </span>
      ))}
      {stagingCodes.map((code, index) => (
        <span key={`s-${code}`} className="text-muted-foreground/50 italic">
          {code}
          {index < stagingCodes.length - 1 && ", "}
        </span>
      ))}
    </span>
  );
}
