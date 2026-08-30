export interface CardStatFields {
  readonly superTypes: readonly string[];
  readonly types: readonly string[];
  readonly domains: readonly string[];
  readonly energy: number | null;
  readonly might: number | null;
  readonly power: number | null;
}

export interface CardStatLabels {
  readonly superTypes: Record<string, string>;
  readonly cardTypes: Record<string, string>;
  readonly domains: Record<string, string>;
}

/**
 * The compact stat line under a card name: super types + types, domains, and
 * whichever of energy/might/power the card has. Labels are looked up
 * defensively (`.filter(Boolean)`) since this also renders in contexts (chat
 * bots) that can't guarantee every slug already has a label row.
 */
export function describeCardStats(card: CardStatFields, labels: CardStatLabels): string {
  const typeLine = [
    ...card.superTypes.map((slug) => labels.superTypes[slug]),
    ...card.types.map((slug) => labels.cardTypes[slug]),
  ]
    .filter(Boolean)
    .join(" ");
  const parts = typeLine ? [typeLine] : [];
  if (card.domains.length > 0) {
    parts.push(
      card.domains
        .map((slug) => labels.domains[slug])
        .filter(Boolean)
        .join(" / "),
    );
  }
  if (card.energy !== null) {
    parts.push(`Energy ${card.energy}`);
  }
  if (card.might !== null) {
    parts.push(`Might ${card.might}`);
  }
  if (card.power !== null) {
    parts.push(`Power ${card.power}`);
  }
  return parts.filter(Boolean).join(" · ");
}
