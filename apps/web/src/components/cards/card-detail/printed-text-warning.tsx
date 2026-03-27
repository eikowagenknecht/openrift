import { TriangleAlert } from "lucide-react";

export function PrintedTextWarning() {
  return (
    <p className="text-muted-foreground/70 mt-1.5 flex items-center gap-1 text-xs">
      <TriangleAlert className="size-3 shrink-0" />
      Printed text on this card differs from the current rules.
    </p>
  );
}
