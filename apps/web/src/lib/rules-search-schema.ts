/** No zod: this schema runs in a route file, whose imports load on every page. */
export function rulesSearchSchema(search: Record<string, unknown>): { q?: string } {
  const q = search.q;
  return typeof q === "string" && q.trim() !== "" ? { q } : {};
}
