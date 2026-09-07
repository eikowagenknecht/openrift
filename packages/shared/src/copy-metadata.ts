import type { CopyLink, CopyMetadataPatch } from "./types/index.js";

export interface CopyMetadata {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  isAltered: boolean;
  links: CopyLink[];
}

export function copyHasMetadata(copy: CopyMetadata & { notesPrivate?: string | null }): boolean {
  return (
    copy.condition !== null ||
    copy.grader !== null ||
    copy.isAltered ||
    copy.notesPublic !== null ||
    (copy.notesPrivate ?? null) !== null ||
    copy.links.length > 0
  );
}

export function copyMetadataWeight(copy: CopyMetadata & { notesPrivate?: string | null }): number {
  let weight = 0;
  if (copy.condition !== null) {
    weight += 1;
  }
  if (copy.grader !== null || copy.grade !== null) {
    weight += 2;
  }
  if (copy.notesPublic !== null) {
    weight += 2;
  }
  if ((copy.notesPrivate ?? null) !== null) {
    weight += 2;
  }
  if (copy.isAltered) {
    weight += 2;
  }
  if (copy.links.length > 0) {
    weight += 2;
  }
  return weight;
}

// Setting a condition clears grading and vice versa; clearing either half of
// grader/grade clears both, to satisfy the `copies` table's check constraints.
export function normalizeCopyMetadataPatch(patch: CopyMetadataPatch): CopyMetadataPatch {
  const set = (value: unknown): boolean => value !== null && value !== undefined;
  const normalized: CopyMetadataPatch = { ...patch };
  if (set(patch.condition)) {
    normalized.grader = null;
    normalized.grade = null;
  }
  if (set(patch.grader) || set(patch.grade)) {
    normalized.condition = null;
  }
  if (patch.grader === null || patch.grade === null) {
    normalized.grader = null;
    normalized.grade = null;
  }
  return normalized;
}

export function definedCopyMetadataFields(patch: CopyMetadataPatch): Partial<CopyMetadataPatch> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<CopyMetadataPatch>;
}
