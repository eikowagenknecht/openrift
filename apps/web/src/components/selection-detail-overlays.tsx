import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import { SelectionDetailModal } from "@/components/selection-detail-modal";
import { SelectionMobileOverlay } from "@/components/selection-mobile-overlay";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { CardViewerItem } from "@/lib/card-viewer-types";

interface SelectionDetailOverlaysProps {
  items: CardViewerItem[];
  printingsByCardId: Map<string, Printing[]>;
  showImages: boolean;
  onSearchAndClose: (query: string) => void;
  actions?: (printing: Printing) => ReactNode;
}

export function SelectionDetailOverlays(props: SelectionDetailOverlaysProps) {
  const isMobile = useIsMobile();
  return isMobile ? <SelectionMobileOverlay {...props} /> : <SelectionDetailModal {...props} />;
}
