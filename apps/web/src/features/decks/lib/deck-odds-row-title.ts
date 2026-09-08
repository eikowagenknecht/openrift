export function oddsRowTitle(label: string, inHand: number): string {
  if (inHand > 1) {
    return `${label} (${inHand} in your hand)`;
  }
  if (inHand === 1) {
    return `${label} (in your hand)`;
  }
  return label;
}
