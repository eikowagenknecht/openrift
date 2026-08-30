import type { MetaEventFieldEdits } from "@openrift/shared";

/** One proposed value beside the one it would replace. */
interface MetaEventCorrectionRow {
  field: keyof MetaEventFieldEdits;
  label: string;
  /** What the archive says today, or a dash when it says nothing. */
  current: string;
  proposed: string;
}

/** The event's own values, as the admin queue receives them. */
export interface MetaEventCorrectionTarget {
  name: string;
  eventDate: string;
  format: string;
  playerCount: number | null;
  organizer: string | null;
  location: string | null;
  country: string | null;
}

/** Reading order, matching the event page's own header. */
const FIELDS: { field: keyof MetaEventFieldEdits; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "eventDate", label: "Date" },
  { field: "format", label: "Format" },
  { field: "playerCount", label: "Players" },
  { field: "organizer", label: "Organizer" },
  { field: "location", label: "Venue" },
  { field: "country", label: "Country" },
];

const EMPTY = "—";

function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? EMPTY : String(value);
}

/**
 * The proposed values a correction carries, each beside what the archive holds.
 *
 * Only fields the sender actually changed appear: the dialog sends the changed
 * boxes and nothing else, so an absent key is "leave it alone" rather than
 * "clear it". A correction with no event behind it (deleted since) still lists
 * its proposals, with nothing to compare them against.
 *
 * @param edits The proposed values.
 * @param event The event as it stands, or null when it is gone.
 * @returns One row per proposed value, in reading order.
 */
export function metaEventCorrectionRows(
  edits: MetaEventFieldEdits,
  event: MetaEventCorrectionTarget | null,
): MetaEventCorrectionRow[] {
  const rows: MetaEventCorrectionRow[] = [];
  for (const { field, label } of FIELDS) {
    const proposed = edits[field];
    if (proposed === undefined) {
      continue;
    }
    rows.push({
      field,
      label,
      current: event === null ? EMPTY : display(event[field]),
      proposed: display(proposed),
    });
  }
  return rows;
}
