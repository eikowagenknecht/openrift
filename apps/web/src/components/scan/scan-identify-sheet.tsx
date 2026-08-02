import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Pressable } from "@/components/ui/pressable";
import { useIsMobile } from "@/hooks/use-is-mobile";

/** One artwork from the current frame's embedding shortlist. */
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
  /** The shortlist to offer, or null while the sheet is closed. */
  candidates: IdentifyCandidate[] | null;
  onPick: (candidate: IdentifyCandidate) => void;
  onDismiss: () => void;
}

/**
 * The manual escape hatch when the scanner will not lock: the current frame's
 * best matches, offered as tappable thumbnails. Picking one adds it exactly
 * like a lock would (finish default, language preference and the printing
 * picker all still apply); dismissing adds nothing.
 *
 * @returns The identify sheet (a drawer on phones).
 */
export function ScanIdentifySheet({ candidates, onPick, onDismiss }: ScanIdentifySheetProps) {
  const isMobile = useIsMobile();
  const open = candidates !== null;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onDismiss();
    }
  };

  const body = candidates && (
    <div className="flex flex-col gap-1">
      {candidates.map((candidate) => {
        const name = candidate.label.split(" (")[0];
        const detail = candidate.label.slice(name.length).replaceAll(/^\s*\(|\)$/gu, "");
        return (
          <Pressable
            key={candidate.key}
            className="hover:bg-muted flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left"
            onClick={() => onPick(candidate)}
          >
            <CardArtThumb
              imageId={candidate.key}
              variant="120w"
              className="w-10"
              landscape={candidate.landscape}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{name}</span>
              <span className="text-muted-foreground block truncate font-mono text-sm">
                {detail}
              </span>
            </span>
          </Pressable>
        );
      })}
    </div>
  );

  const title = "Which card is in the frame?";
  const description =
    "The closest matches for what the camera sees right now. Pick the card in hand, or dismiss if none of them is it.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange} showSwipeHandle>
        <DrawerContent>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
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
        <DialogDescription>{description}</DialogDescription>
        <div className="max-h-96 overflow-y-auto">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
