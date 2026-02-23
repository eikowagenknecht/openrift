import { DOMAIN_COLORS } from "@/components/cards/CardPlaceholderImage";

export function getDomainGradientStyle(domain: string, alpha = ""): React.CSSProperties {
  const domains = domain.split("/");
  const c1 = (DOMAIN_COLORS[domains[0]] ?? "#737373") + alpha;
  if (domains.length === 1) {
    return { backgroundColor: c1 };
  }
  const c2 = (DOMAIN_COLORS[domains[1]] ?? "#737373") + alpha;
  return { background: `linear-gradient(90deg, ${c1} 30%, ${c2} 70%)` };
}

export function getDomainTintStyle(domain: string): React.CSSProperties {
  const domains = domain.split("/");
  const c1 = DOMAIN_COLORS[domains[0]] ?? "#737373";
  if (domains.length > 1) {
    const c2 = DOMAIN_COLORS[domains[1]] ?? "#737373";
    return { backgroundImage: `linear-gradient(135deg, ${c1}18 0%, ${c2}18 100%)` };
  }
  return { backgroundImage: `linear-gradient(to bottom, ${c1}18, transparent 80%)` };
}

export function formatDomainDisplay(faction: string): string {
  if (faction === "Colorless") {
    return "No Domain";
  }
  return faction.replace("/", " / ");
}

export function formatDomainFilterLabel(value: string): string {
  return value === "Colorless" ? "None" : value;
}
