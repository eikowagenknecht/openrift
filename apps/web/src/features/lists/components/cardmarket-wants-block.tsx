import { Textarea } from "@/components/ui/textarea";
import { CopyTextButton } from "@/features/groups/components/copy-text-button";
import type { CardmarketWant } from "@/features/lists/lib/list-export";
import { formatCardmarketWants } from "@/features/lists/lib/list-export";

interface CardmarketWantsBlockProps {
  wants: readonly CardmarketWant[];
}

// Cardmarket's shopping wizard matches lines by card name; any extra text
// (short codes, prices, CSV columns) breaks the match.
export function CardmarketWantsBlock({ wants }: CardmarketWantsBlockProps) {
  const text = formatCardmarketWants(wants);

  if (text.length === 0) {
    return null;
  }

  const lineCount = text.split("\n").length;

  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">Cardmarket wants</h3>
        <CopyTextButton label="Copy" getText={() => text} size="sm" />
      </div>
      <p className="text-muted-foreground text-sm">
        Paste into Cardmarket&apos;s shopping wizard to price the list with your own filters.
      </p>
      <Textarea
        readOnly
        value={text}
        className="field-sizing-fixed font-mono text-xs"
        rows={Math.min(Math.max(lineCount, 2), 8)}
        onClick={(event) => (event.target as HTMLTextAreaElement).select()}
      />
    </div>
  );
}
