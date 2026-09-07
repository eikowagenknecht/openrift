import { DEFAULT_DOMAIN_COLORS, DOMAIN_COLOR_FALLBACK, WellKnown } from "@openrift/shared";

import { contrastGlyphTint } from "./color";

function resolve(colors: Record<string, string>, domain: string): string {
  return colors[domain] ?? DEFAULT_DOMAIN_COLORS[domain] ?? DOMAIN_COLOR_FALLBACK;
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

/** Hard 50/50 split, not the soft blend used elsewhere, so the dual identity reads at pip size. */
export function getPipBackgroundStyle(
  domains: string[],
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): React.CSSProperties {
  const c1 = resolve(colors, domains[0]);
  if (domains.length < 2) {
    return { backgroundColor: c1 };
  }
  const c2 = resolve(colors, domains[1]);
  return { background: `linear-gradient(90deg, ${c1} 50%, ${c2} 50%)` };
}

/** A two-domain pip straddles a split background, so it always reads white. */
export function getPipGlyphTint(
  domains: string[],
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): "white" | "black" {
  if (domains.length > 1) {
    return "white";
  }
  return contrastGlyphTint(resolve(colors, domains[0] ?? WellKnown.domain.COLORLESS));
}

export function formatDomainFilterLabel(value: string, labels?: Record<string, string>): string {
  return value === WellKnown.domain.COLORLESS ? "None" : (labels?.[value] ?? value);
}

const MAX_DOMAINS = 2;

export function computeDomainDisabled(
  selected: string[],
  options: readonly string[],
): ReadonlySet<string> {
  const disabled = new Set<string>();
  const hasColorless = selected.includes(WellKnown.domain.COLORLESS);
  const atMax = selected.length >= MAX_DOMAINS;
  for (const slug of options) {
    if (selected.includes(slug)) {
      continue;
    }
    if (hasColorless) {
      disabled.add(slug);
      continue;
    }
    if (slug === WellKnown.domain.COLORLESS) {
      if (selected.length > 0) {
        disabled.add(slug);
      }
    } else if (atMax) {
      disabled.add(slug);
    }
  }
  return disabled;
}

export function deckGlowStyle(
  domains: readonly string[],
  colors: Record<string, string> = DEFAULT_DOMAIN_COLORS,
): React.CSSProperties {
  if (domains.length === 0) {
    return {
      backgroundImage:
        "radial-gradient(80% 140% at 20% 0%, oklch(0.6 0.02 260 / 0.14) 0%, transparent 60%)",
    };
  }
  const first = getDomainColor(domains[0], colors);
  const second = domains.length > 1 ? getDomainColor(domains[1], colors) : first;
  return {
    backgroundImage: `radial-gradient(70% 150% at 12% 0%, ${first}3d 0%, transparent 62%), radial-gradient(60% 130% at 88% 0%, ${second}33 0%, transparent 58%)`,
  };
}
