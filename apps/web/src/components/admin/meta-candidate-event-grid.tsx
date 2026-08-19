import type { AdminMetaEvent, MetaCandidateSource } from "@openrift/shared";
import type { MetaEventAcceptField } from "@openrift/shared/contracts/admin/meta";
import { META_EVENT_ACCEPT_FIELDS } from "@openrift/shared/contracts/admin/meta";
import { CopyCheckIcon, Link2OffIcon } from "lucide-react";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import type { FieldDef } from "@/components/admin/candidate-spreadsheet";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { MetaEventInput } from "@/hooks/use-admin-meta";
import { useUpdateMetaEvent } from "@/hooks/use-admin-meta";
import { useAcceptMetaEventField } from "@/hooks/use-admin-meta-candidates";
import { useDeckFormatList } from "@/hooks/use-enums";

/**
 * The grid's rows: every column the per-field accept can write, plus the two
 * read-only ones a source carries that the live event has no column for.
 * `sourceUrl` is here because it is what the provider's citation links to —
 * seeing it is how an admin tells two sources apart at a glance.
 */
type MetaEventGridFieldKey = MetaEventAcceptField | "externalId" | "sourceUrl";

const ACCEPT_FIELDS = new Set<string>(META_EVENT_ACCEPT_FIELDS);

/**
 * Whether a grid key is one the accept endpoint takes. The read-only columns
 * are not clickable, so this only ever refuses a key that should not have been
 * sent — but it is what keeps the mutation's type honest.
 *
 * @param key - The grid field key.
 * @returns True when the key names a live event column.
 */
function isEventAcceptField(key: string): key is MetaEventAcceptField {
  return ACCEPT_FIELDS.has(key);
}

/**
 * The event fields the compare grid shows, with the format column's options
 * resolved so an unknown format from a source reads as invalid rather than as a
 * value to take.
 *
 * @param formatOptions - The configured deck formats as value/label pairs.
 * @returns The field definitions, in the order the grid stacks them.
 */
function buildMetaEventFields(
  formatOptions: { value: string; label: string }[],
): FieldDef<MetaEventGridFieldKey>[] {
  return [
    { key: "externalId", label: "External ID", readOnly: true },
    { key: "name", label: "Name" },
    { key: "eventDate", label: "Date" },
    { key: "format", label: "Format", labeledOptions: formatOptions },
    { key: "playerCount", label: "Players", type: "number" },
    { key: "organizer", label: "Organizer" },
    { key: "notes", label: "Notes", multiline: true },
    { key: "sourceUrl", label: "Source link", readOnly: true },
  ];
}

/**
 * Builds the PATCH body for one edited cell in the Active column. Returns null
 * for an edit the live row cannot take — clearing a NOT NULL column, or a
 * player count that is not a positive whole number — so the grid's lenient
 * inline editor cannot produce a 400.
 *
 * @param field - The column that was edited.
 * @param value - The committed value, or null when the cell was cleared.
 * @returns The patch to send, or null to ignore the edit.
 */
export function metaEventFieldPatch(
  field: MetaEventAcceptField,
  value: unknown,
): Partial<MetaEventInput> | null {
  if (field === "playerCount") {
    if (value === null) {
      return { playerCount: null };
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return null;
    }
    return { playerCount: value };
  }
  if (field === "organizer") {
    return { organizer: value === null ? null : String(value) };
  }
  if (field === "notes") {
    return { notes: value === null ? null : String(value) };
  }
  // The remaining three are NOT NULL on the live row, so a cleared cell is a
  // no-op rather than a write that would be refused.
  if (value === null || String(value).trim().length === 0) {
    return null;
  }
  if (field === "name") {
    return { name: String(value) };
  }
  if (field === "eventDate") {
    return { eventDate: String(value) };
  }
  return { format: String(value) };
}

interface SourceColumnActionsProps {
  /** Injected by the grid via cloneElement, one clone per source column. */
  row?: MetaCandidateSource;
  onAcceptSource: (candidateId: string, provider: string) => void;
  onUnlinkSource: (candidateId: string, provider: string) => void;
}

function MetaSourceColumnActions({
  row,
  onAcceptSource,
  onUnlinkSource,
}: SourceColumnActionsProps) {
  if (!row) {
    return null;
  }
  return (
    <>
      <DropdownMenuItem onClick={() => onAcceptSource(row.id, row.provider)}>
        <CopyCheckIcon className="mr-2" />
        Take everything from {row.provider}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onUnlinkSource(row.id, row.provider)}>
        <Link2OffIcon className="mr-2" />
        Unlink {row.provider}
      </DropdownMenuItem>
    </>
  );
}

interface MetaCandidateEventGridProps {
  /** The live event the sources are compared against; the editable Active column. */
  event: AdminMetaEvent;
  /** Every candidate linked to it, one column each. */
  sources: MetaCandidateSource[];
  /** Opens the whole-source accept, which the multi-source guard may question. */
  onAcceptSource: (candidateId: string, provider: string) => void;
  onUnlinkSource: (candidateId: string, provider: string) => void;
}

/**
 * The event header's compare grid (ADR-014's review screen, tier one): the six
 * live columns down the side, one column per linked source across, and the
 * archive's own values in an editable Active column between them. Clicking a
 * source cell writes that one field, which is the whole point — with two
 * sources on an event, taking everything from one silently reverts what the
 * other contributed.
 *
 * @returns The compare grid.
 */
export function MetaCandidateEventGrid({
  event,
  sources,
  onAcceptSource,
  onUnlinkSource,
}: MetaCandidateEventGridProps) {
  const { formats } = useDeckFormatList();
  const acceptField = useAcceptMetaEventField();
  const updateEvent = useUpdateMetaEvent();

  const formatOptions = formats.map((format) => ({ value: format.slug, label: format.label }));
  const fields = buildMetaEventFields(formatOptions);

  return (
    <CandidateSpreadsheet
      fields={fields}
      requiredKeys={["name", "eventDate", "format"]}
      activeRow={{ ...event }}
      candidateRows={sources}
      onCellClick={(field, _value, candidateId) => {
        if (!isEventAcceptField(field)) {
          return;
        }
        acceptField.mutate({ id: candidateId, field });
      }}
      onActiveChange={(field, value) => {
        if (value === undefined || !isEventAcceptField(field)) {
          return;
        }
        const patch = metaEventFieldPatch(field, value);
        if (patch === null) {
          return;
        }
        updateEvent.mutate({ id: event.id, ...patch });
      }}
      columnActions={
        <MetaSourceColumnActions onAcceptSource={onAcceptSource} onUnlinkSource={onUnlinkSource} />
      }
    />
  );
}
