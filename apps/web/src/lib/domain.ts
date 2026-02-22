import { DOMAIN_COLORS } from "@/components/cards/CardPlaceholderImage";

export function getDomainGradientStyle(domain: string, alpha = ""): React.CSSProperties {
  const domains = domain.split("/");
  const c1 = (DOMAIN_COLORS[domains[0]] ?? "#737373") + alpha;
  if (domains.length === 1) {
    return { backgroundColor: c1 };
  }
  const c2 = (DOMAIN_COLORS[domains[1]] ?? "#737373") + alpha;
  return { background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)` };
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
