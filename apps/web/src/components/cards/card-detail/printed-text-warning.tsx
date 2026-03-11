import { TriangleAlert } from "lucide-react";

export function PrintedTextWarning() {
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
      <TriangleAlert className="size-3 shrink-0" />
      Printed text on this card differs from the current rules.
    </p>
  );
}
