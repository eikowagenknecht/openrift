/**
 * The rules pages' search query, in the URL rather than only in the Zustand
 * store, so a rules search is a link you can send, come back to, and reach from
 * the command palette.
 *
 * Hand-written rather than zod: a route file's imports run on every page load,
 * and this is the whole schema.
 *
 * @returns The validated search params.
 */
export function rulesSearchSchema(search: Record<string, unknown>): { q?: string } {
  const q = search.q;
  return typeof q === "string" && q.trim() !== "" ? { q } : {};
}
