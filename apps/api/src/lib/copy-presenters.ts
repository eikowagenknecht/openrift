import type { CopyLink, CopyResponse, PublicCopyResponse } from "@openrift/shared";

interface CopyMetadataFields {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  notesPrivate: string | null;
  isAltered: boolean;
  links: CopyLink[];
}

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

/** Withholds the owner-internal `groupId`/`collectionId` and `notesPrivate`. */
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
