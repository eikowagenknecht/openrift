import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import { SelectionDetailModal } from "@/components/selection-detail-modal";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface SelectionDetailOverlaysProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
  /** Surface-specific add controls for the shown card. See SelectionDetailPane. */
  actions?: (printing: Printing) => ReactNode;
}

/**
 * The card detail overlay for the current viewport: the fullscreen drawer on
 * phones, the two-column dialog on desktop. Both render nothing while the
 * detail is closed, and the dialog also stands down while the pane is docked.
 *
 * Every card-browser surface mounts this next to its `SelectionDetailPane`, so
 * no surface decides for itself what a card click opens.
 * @returns The detail overlay for this viewport.
 */
export function SelectionDetailOverlays(props: SelectionDetailOverlaysProps) {
  const isMobile = useIsMobile();
  return isMobile ? <SelectionMobileOverlay {...props} /> : <SelectionDetailModal {...props} />;
}
