import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

const FALLBACK_COLOR = "#737373";

/** Fallback domain colors matching the initial database seed. */
export const DEFAULT_DOMAIN_COLORS: Record<string, string> = {
  Fury: "#CB212D",
  Calm: "#16AA71",
  Mind: "#227799",
  Body: "#E2710C",
  Chaos: "#6B4891",
  Order: "#CDA902",
  Colorless: "#737373",
} satisfies Record<Domain, string>;

function resolve(colors: Record<string, string>, domain: string): string {
  return colors[domain] ?? DEFAULT_DOMAIN_COLORS[domain] ?? FALLBACK_COLOR;
}

export function getDomainGradientStyle(
  domains: string[],
  alpha = "",
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): React.CSSProperties {
  const c1 = resolve(colors, domains[0]) + alpha;
  if (domains.length === 1) {
    return { backgroundColor: c1 };
  }
  const c2 = resolve(colors, domains[1]) + alpha;
  return { background: `linear-gradient(90deg, ${c1} 30%, ${c2} 70%)` };
}

export function getDomainTintStyle(
  domains: string[],
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): React.CSSProperties {
  const c1 = resolve(colors, domains[0]);
  if (domains.length > 1) {
    const c2 = resolve(colors, domains[1]);
    return { backgroundImage: `linear-gradient(135deg, ${c1}18 0%, ${c2}18 100%)` };
  }
  return { backgroundImage: `linear-gradient(to bottom, ${c1}18, transparent 80%)` };
}

export function getDomainColor(
  domain: string,
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): string {
  return resolve(colors, domain);
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
