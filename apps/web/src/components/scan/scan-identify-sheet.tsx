import { Loader2Icon } from "lucide-react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Pressable } from "@/components/ui/pressable";
import { useIsMobile } from "@/hooks/use-is-mobile";

/** One artwork from the identified frame's embedding shortlist. */
export interface IdentifyCandidate {
  /** Bank key (an image id) — doubles as the thumbnail source. */
  key: string;
  artKey: string;
  /** Display label from the scan bank, e.g. "Lux (OGN-011/298 EN)". */
  label: string;
  /** Battlefield art, stored landscape, so the thumbnail rotates it upright. */
  landscape: boolean;
}

interface ScanIdentifySheetProps {
  open: boolean;
  /**
   * The frame being identified, as a JPEG data URL. Shown from the moment the
   * user asks, so which frame is being answered is never in doubt — the camera
   * has long moved on by the time the answer comes back.
   */
  snapshot: string | null;
  /** The frame is still going through the pipeline. */
  pending: boolean;
  /** The shortlist to offer, once there is one. */
  candidates: IdentifyCandidate[];
  onPick: (candidate: IdentifyCandidate) => void;
  onDismiss: () => void;
}

/**
 * The manual escape hatch when the scanner will not lock: the captured frame
 * and its best matches, offered as tappable thumbnails. Picking one adds it
 * exactly like a lock would (finish default, language preference and the
 * printing picker all still apply); dismissing adds nothing.
 *
 * @returns The identify sheet (a drawer on phones).
 */
export function ScanIdentifySheet({
  open,
  snapshot,
  pending,
  candidates,
  onPick,
  onDismiss,
}: ScanIdentifySheetProps) {
  const isMobile = useIsMobile();

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDismiss();
    }
  };

  const list = (
    <div className="flex flex-col gap-1">
      {candidates.map((candidate) => {
        const name = candidate.label.split(" (")[0];
        const detail = candidate.label.slice(name.length).replaceAll(/^\s*\(|\)$/gu, "");
        return (
          <Pressable
            key={candidate.key}
            className="hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5"
            onClick={() => onPick(candidate)}
          >
            {/* The bank knows the artwork, not the printing: no rarity, no
                domains, so the lead is the art strip alone. */}
            <CardMiniRow
              imageId={candidate.key}
              landscape={candidate.landscape}
              artClassName="h-10"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{name}</span>
              {/* The bank's label already reads as a code, so it keeps the mono
                  face the printing picker's variant line gets from its code slot. */}
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {detail}
              </span>
            </span>
          </Pressable>
        );
      })}
    </div>
  );

  const body = (
    <div className="flex gap-3">
      {/* The guide is an upright card outline whatever the card's orientation,
          so the snapshot always has the same shape. */}
      {snapshot !== null && (
        <img
          src={snapshot}
          alt=""
          className="bg-muted h-32 w-24 shrink-0 rounded-md object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        {pending && (
          <p className="text-muted-foreground flex items-center gap-2">
            <Loader2Icon className="size-4 animate-spin" />
            Recognising…
          </p>
        )}
        {!pending && candidates.length === 0 && (
          <p className="text-muted-foreground">
            Nothing in that frame looked like a card. Fill the guide with it and try again.
          </p>
        )}
        {!pending && candidates.length > 0 && list}
      </div>
    </div>
  );

  const title = "Which card is this?";
  const description = pending ? "Working out what the camera just saw." : null;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} showSwipeHandle>
        <DrawerContent>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
            <div className="min-h-0 overflow-y-auto">{body}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
        <div className="max-h-96 overflow-y-auto">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
