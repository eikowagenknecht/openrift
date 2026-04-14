import { Link } from "@tanstack/react-router";
import { LayersIcon, PackageIcon, SearchIcon, UnlockIcon } from "lucide-react";

const features = [
  {
    icon: SearchIcon,
    title: "Every card, every printing",
    description:
      "Complete catalog, Chinese printings and promos included. Prices from TCGplayer, Cardmarket, and CardTrader on every printing.",
    to: "/cards",
  },
  {
    icon: PackageIcon,
    title: "Your collection, tracked",
    description:
      "Keep multiple collections side by side, down to the individual printing. See value over time and what it'd cost to finish any set.",
    to: "/collections",
  },
  {
    icon: LayersIcon,
    title: "Build with what you own",
    description:
      "Validated as you build, cross-referenced with your collections. You see what you own, what's missing, and can print the rest as proxies.",
    to: "/decks",
  },
  {
    icon: UnlockIcon,
    title: "Open, not locked in",
    description:
      "Open source and free. Import from Piltover Archive, Riftcore, or Riftmana, and export to CSV whenever you want.",
    to: "/collections/import",
  },
] as const;

export function FeatureHighlights() {
  return (
    <section className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-12 md:grid-cols-2 md:gap-6 md:py-16 lg:grid-cols-4">
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
