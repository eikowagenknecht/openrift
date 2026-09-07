export function enumLabel(map: Record<string, string>, slug: string): string {
  return map[slug] ?? slug;
}
