import type { Domain } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import { contrastGlyphTint } from "./color";

const FALLBACK_COLOR = "#737373";

/** Fallback domain colors matching the initial database seed. */
export const DEFAULT_DOMAIN_COLORS: Record<string, string> = {
  fury: "#CB212D",
  calm: "#16AA71",
  mind: "#227799",
  body: "#E2710C",
  chaos: "#6B4891",
  order: "#CDA902",
  colorless: "#737373",
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

/**
 * Background for the power-pip stack: a solid domain color, or a hard 50/50
 * split of the two domain colors for a dual-domain card (not the soft blend the
 * rest of the card uses), so the dual identity reads clearly at pip size.
 *
 * @returns The CSS background for the pip container.
 */
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

/**
 * Picks the flat tint ("white" or "black") for the domain rune drawn in the
 * power-pip stack, so it stays legible against its domain background. A
 * two-domain pip straddles a split background, so it always reads white.
 *
 * @returns "black" on light single-domain backgrounds, "white" otherwise.
 */
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

/** A card can carry at most this many domains. */
const MAX_DOMAINS = 2;

/**
 * Given the currently-selected domains, returns the set of options that should
 * be disabled in a multi-select: colorless is mutually exclusive with every
 * other domain, and otherwise no more than `MAX_DOMAINS` may be picked.
 * Already-selected options are never disabled (so they can be removed).
 *
 * @returns The set of domain slugs to disable.
 */
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
