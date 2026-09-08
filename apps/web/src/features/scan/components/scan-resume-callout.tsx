import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cardWord } from "@/features/scan/lib/scan-card-word";

interface ScanResumeCalloutProps {
  cards: number;
  when: string;
  destinationName: string;
  adding: boolean;
  onAddAll: () => void;
  onDiscard: () => void;
}

export function ScanResumeCallout({
  cards,
  when,
  destinationName,
  adding,
  onAddAll,
  onDiscard,
}: ScanResumeCalloutProps) {
  return (
    <Callout className="border-warning mb-2 p-3">
      <div className="flex gap-2">
        <TriangleAlertIcon className="text-warning mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          <p>
            These {cards} {cardWord(cards)} were scanned {when} and never added to a collection.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={adding} onClick={onAddAll}>
              Add them to {destinationName}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </div>
      </div>
    </Callout>
  );
}
