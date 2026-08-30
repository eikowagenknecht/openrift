import type { CopyLink, CopyMetadataPatch } from "./types/index.js";

/** The metadata half of a copy row (ADR-038), as stored and served. */
export interface CopyMetadata {
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  isAltered: boolean;
  links: CopyLink[];
}

/**
 * Whether a copy carries any recorded metadata (ADR-038) — used by tiles to
 * decide whether to draw the annotation indicator. `notesPrivate` is checked
 * when present (the public share projection omits it).
 *
 * @returns True when at least one metadata field is set.
 */
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

/**
 * How much metadata a copy carries (ADR-038). Callers that need to pick the
 * "plainest" copy from a stack (a default trade pin, a default move) use this
 * so a graded, noted, or altered copy stays put unless nothing plainer is
 * available. `notesPrivate` is checked when present, matching
 * {@link copyHasMetadata}.
 *
 * @returns The weight; lower means plainer.
 */
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

/**
 * Normalizes the cross-field state of a copy-metadata patch (ADR-038) so a
 * patch only has to be internally consistent: setting a condition clears
 * grading, setting grading clears the condition, and clearing either half of
 * grader/grade clears both. Keeps the `copies` check constraints satisfied
 * without clients sending explicit nulls for fields they are switching away
 * from. Used by the API service and by the web client's optimistic update so
 * both sides apply the identical patch.
 *
 * @returns A new patch with the implied nulls filled in.
 */
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

/**
 * The subset of a normalized patch that is actually set (drops `undefined`
 * keys), typed for partial application onto a copy row.
 *
 * @returns An object containing only the defined patch fields.
 */
export function definedCopyMetadataFields(patch: CopyMetadataPatch): Partial<CopyMetadataPatch> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<CopyMetadataPatch>;
}
