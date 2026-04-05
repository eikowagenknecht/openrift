import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

export const DOMAIN_COLORS: Record<string, string> = {
  Fury: "#CB212D",
  Calm: "#16AA71",
  Mind: "#227799",
  Body: "#E2710C",
  Chaos: "#6B4891",
  Order: "#CDA902",
  Colorless: "#737373",
} satisfies Record<Domain, string>;

export function getDomainGradientStyle(domains: string[], alpha = ""): React.CSSProperties {
  const c1 = (DOMAIN_COLORS[domains[0]] ?? "#737373") + alpha;
  if (domains.length === 1) {
    return { backgroundColor: c1 };
  }
  const c2 = (DOMAIN_COLORS[domains[1]] ?? "#737373") + alpha;
  return { background: `linear-gradient(90deg, ${c1} 30%, ${c2} 70%)` };
}

export function getDomainTintStyle(domains: string[]): React.CSSProperties {
  const c1 = DOMAIN_COLORS[domains[0]] ?? "#737373";
  if (domains.length > 1) {
    const c2 = DOMAIN_COLORS[domains[1]] ?? "#737373";
    return { backgroundImage: `linear-gradient(135deg, ${c1}18 0%, ${c2}18 100%)` };
  }
  return { backgroundImage: `linear-gradient(to bottom, ${c1}18, transparent 80%)` };
}

export function formatDomainDisplay(domains: string[]): string {
  if (domains.length === 1 && domains[0] === WellKnown.domain.COLORLESS) {
    return "No Domain";
  }
  return domains.join(" / ");
}

export function formatDomainFilterLabel(value: string): string {
  return value === WellKnown.domain.COLORLESS ? "None" : value;
}
