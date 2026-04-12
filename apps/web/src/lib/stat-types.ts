import type { Domain } from "@openrift/shared";

export interface DomainCount {
  domain: Domain;
  count: number;
}

/** A single domain or a multi-domain combo (e.g. Fire+Water). */
export interface DomainCombo {
  key: string;
  domains: Domain[];
}

export type EnergyCostCount = Record<string, string | number> & { energy: string };

export interface TypeCount {
  type: string;
  total: number;
  [domain: string]: string | number;
}

export type PowerCount = Record<string, string | number> & { power: string };

/**
 * Builds a domain combo key from a card's domains, sorted by domain order.
 * @returns A stable string key like "Fire" or "Fire+Water".
 */
export function comboKey(domains: Domain[], domainOrder: readonly string[]): string {
  return domains.toSorted((a, b) => domainOrder.indexOf(a) - domainOrder.indexOf(b)).join("+");
}

/**
 * Sorts domain combos: singles and combos interleaved by average domain position.
 * Singles sort before combos at the same position.
 * @returns A sorted array of DomainCombo.
 */
export function sortCombos(comboSet: Set<string>, domainOrder: readonly string[]): DomainCombo[] {
  return [...comboSet]
    .map((key) => ({ key, domains: key.split("+") as Domain[] }))
    .toSorted((a, b) => {
      const posA =
        a.domains.reduce((sum, domain) => sum + domainOrder.indexOf(domain), 0) / a.domains.length;
      const posB =
        b.domains.reduce((sum, domain) => sum + domainOrder.indexOf(domain), 0) / b.domains.length;
      if (posA !== posB) {
        return posA - posB;
      }
      return a.domains.length - b.domains.length;
    });
}
