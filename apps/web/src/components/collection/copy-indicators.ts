import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { LucideIcon } from "lucide-react";
import { FileTextIcon, LinkIcon, LockIcon, PaintbrushIcon } from "lucide-react";

// `content` is the fuller tooltip body that spacious surfaces show and compact
// ones ignore.
export interface CopyMarker {
  key: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  content?: string;
}

// Shared by CopyMetadataStrip and CopySummary so they never drift. Excludes
// condition/grade and loan status: each surface renders those its own way.
export function copyMarkers(copy: CopyResponse): CopyMarker[] {
  const markers: CopyMarker[] = [];
  if (copy.isAltered) {
    markers.push({ key: "altered", icon: PaintbrushIcon, label: "Altered" });
  }
  if (copy.notesPublic !== null) {
    markers.push({
      key: "note",
      icon: FileTextIcon,
      label: "Public note",
      content: copy.notesPublic,
    });
  }
  if (copy.notesPrivate !== null) {
    markers.push({
      key: "private-note",
      icon: LockIcon,
      label: "Private note",
      content: copy.notesPrivate,
    });
  }
  if (copy.links.length > 0) {
    markers.push({
      key: "links",
      icon: LinkIcon,
      label: copy.links.length === 1 ? "1 link" : `${copy.links.length} links`,
      count: copy.links.length,
      content: copy.links.map((link) => link.label ?? link.url).join("\n"),
    });
  }
  return markers;
}

// Reuses copyMarkers so the "No details yet" fallback can't drift out of
// sync with the marker fields.
export function copyHasRecordedDetails(copy: CopyResponse): boolean {
  return (
    copy.onLoan ||
    // A reservation alone must still count as a recorded detail.
    copy.reserved ||
    (copy.grader !== null && copy.grade !== null) ||
    copy.condition !== null ||
    copyMarkers(copy).length > 0
  );
}
