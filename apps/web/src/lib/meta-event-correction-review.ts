import type { MetaEventFieldEdits } from "@openrift/shared/types/api/meta";

interface MetaEventCorrectionRow {
  field: keyof MetaEventFieldEdits;
  label: string;
  current: string;
  proposed: string;
}

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
 * An absent key means leave it alone, not clear it. An event that is gone
 * (deleted since) still lists its proposals, with nothing to compare against.
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
