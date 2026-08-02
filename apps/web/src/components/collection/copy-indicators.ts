import type { CopyResponse } from "@openrift/shared";
import type { LucideIcon } from "lucide-react";
import { FileTextIcon, LinkIcon, LockIcon, PaintbrushIcon } from "lucide-react";

/**
 * One uniform icon marker a copy carries. `content` is the fuller tooltip body
 * (a note's text, the link list) that spacious surfaces show and compact ones
 * ignore; `count` is rendered next to the icon (the link count).
 */
export interface CopyMarker {
  /** Stable React key / identity. */
  key: string;
  icon: LucideIcon;
  /** Accessible name, title, and default tooltip text. */
  label: string;
  /** Shown next to the icon (link count). */
  count?: number;
  /** Fuller tooltip body when there is one (note text, link list). */
  content?: string;
}

/**
 * The uniform icon markers a copy carries, in canonical order: altered, public
 * note, private note, links. Shared by the copies-view tile strip
 * (`CopyMetadataStrip`) and the copy-details picker (`CopySummary`) so the two
 * never drift on which markers exist or which icon each uses. Condition/grade
 * and loan status are deliberately excluded — each surface renders those its own
 * way (a text badge vs. a compact short-code pill, the shared `OnLoanChip`).
 * @returns The ordered markers, empty when the copy carries none.
 */
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

/**
 * Whether a copy has anything worth summarizing: it is out on loan, pinned to a
 * live trade, has a condition or grade, or carries any marker. Drives the
 * "No details yet" fallback, so it stays in sync with everything the summaries
 * surface by reusing `copyMarkers` rather than re-listing the marker fields.
 * @returns `true` when the copy has any state worth showing.
 */
export function copyHasRecordedDetails(copy: CopyResponse): boolean {
  return (
    copy.onLoan ||
    // A reservation is the copy's most consequential state (it is promised to
    // someone), so a copy whose only notable fact is that must not report
    // having no details.
    copy.reserved ||
    (copy.grader !== null && copy.grade !== null) ||
    copy.condition !== null ||
    copyMarkers(copy).length > 0
  );
}
