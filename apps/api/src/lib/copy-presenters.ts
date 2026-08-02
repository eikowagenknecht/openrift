import type { CopyLink, CopyResponse, PublicCopyResponse } from "@openrift/shared";

/** The per-copy metadata fields (ADR-038) as they appear on responses. */
interface CopyMetadataFields {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: boolean;
  links: CopyLink[];
}

/**
 * Maps a copy row to CopyResponse.
 * @returns The serialized copy response.
 */
export function toCopy(
  row: {
    id: string;
    printingId: string;
    collectionId: string;
    groupId: string | null;
    onLoan: boolean;
    reserved: boolean;
  } & CopyMetadataFields,
): CopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    collectionId: row.collectionId,
    groupId: row.groupId,
    onLoan: row.onLoan,
    reserved: row.reserved,
    condition: row.condition,
    grader: row.grader,
    grade: row.grade,
    notesPublic: row.notesPublic,
    notesPrivate: row.notesPrivate,
    isAltered: row.isAltered,
    links: row.links,
  };
}

/**
 * Maps a copy row to the narrower public projection for anonymous share
 * viewers — withholds the owner-internal `groupId`/`collectionId` and the
 * owner's `notesPrivate` (never exposed on public surfaces, ADR-038).
 * @returns The serialized public copy response.
 */
export function toPublicCopy(
  row: { id: string; printingId: string } & CopyMetadataFields,
): PublicCopyResponse {
  return {
    id: row.id,
    printingId: row.printingId,
    condition: row.condition,
    grader: row.grader,
    grade: row.grade,
    notesPublic: row.notesPublic,
    isAltered: row.isAltered,
    links: row.links,
  };
}
