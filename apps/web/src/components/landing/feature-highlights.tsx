import { Link } from "@tanstack/react-router";
import { LayersIcon, PackageIcon, SearchIcon } from "lucide-react";

const features = [
  {
    icon: SearchIcon,
    title: "Browse every card",
    description:
      "Search and filter the full Riftbound catalog — by set, domain, rarity, energy cost, and more.",
    to: "/cards",
  },
  {
    icon: PackageIcon,
    title: "Track your collection",
    description:
      "Know exactly what you own across multiple collections. Import from other tools or add cards one by one.",
    to: "/collections",
  },
  {
    icon: LayersIcon,
    title: "Build decks",
    description:
      "Drag-and-drop deck builder with rule validation, stats, and proxy printing for playtesting.",
    to: "/decks",
  },
] as const;

export function FeatureHighlights() {
  return (
    <section className="mx-auto grid w-full max-w-3xl gap-8 px-6 py-12 md:grid-cols-3 md:gap-6 md:py-16">
      {features.map((feature) => (
        <Link
          key={feature.title}
          to={feature.to}
          data-card-blocker=""
          className="bg-background/70 group flex flex-col items-center gap-2 rounded-xl p-5 text-center backdrop-blur-sm"
        >
          <feature.icon className="text-primary size-8 transition-transform group-hover:scale-110" />
          <h2 className="text-lg font-semibold">{feature.title}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
        </Link>
      ))}
    </section>
  );
}
