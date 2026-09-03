import { siDiscord } from "simple-icons";

import { Badge } from "@/components/ui/badge";
import type { LandingThumbnailCard } from "@/lib/landing-thumbnails";

import { Vignette } from "./vignette-parts";

// EMBED_COLOR in apps/discord-bot/src/card-embed.ts. Fixed for every embed
// type, so it never varies with the card.
const EMBED_ACCENT = "#24705F";

// The bot formats embed prices with Intl currency, which prefixes the euro
// symbol — deliberately unlike the web app's "3,80 €".
const PRICE_FIELDS = [
  { name: "TCGplayer", value: "$4.52" },
  { name: "Cardmarket", value: "€3.80" },
  { name: "CardTrader", value: "€3.65" },
] as const;

// Shown when the sample has no identity for its art — the payload is edge
// cached for a day, so a bundle can be served a body that predates those
// fields. The embed then names a card it cannot show, so the art drops out.
const UNNAMED = { name: "Jinx, Rebel", shortCode: "OGN-202" };

/**
 * Two lines per holder: the name and count, then a Discord "-#" subtext line
 * of printings. A repeated public code drops off the second entry.
 * @returns The holders the tradelist field lists.
 */
function holders(shortCode: string) {
  return [
    { name: "Alice", quantity: "2×", detail: `${shortCode} 2× (Binder)` },
    {
      name: "Mira",
      quantity: "2×",
      detail: `${shortCode} Standard 1× (Binder) · Alt Art 1× (Trades)`,
    },
  ];
}

function EmbedField({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs font-semibold">{name}</span>
      <span className="text-primary text-sm tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The bot's reply to an inline card reference: the full-width tradelist field
 * first, then the inline price fields, the card art large at the bottom, and
 * one `Details` button. There is no stat line on a card embed — the stats are
 * printed on the artwork the embed already shows.
 *
 * Every name in the reply comes off the sampled printing, so the embed names
 * the card whose art it shows. Passing art without its identity would have the
 * bot answer `[[Jinx, Rebel]]` with whatever the day's sample happened to be.
 * @returns The Discord vignette.
 */
export function DiscordVignette({ card }: { card?: LandingThumbnailCard }) {
  const named = card?.name ? card : undefined;
  const name = named?.name ?? UNNAMED.name;
  const shortCode = named?.shortCode ?? UNNAMED.shortCode;
  const reference = `[[${name}]]`;
  const footer = [shortCode, named?.variantLabel].filter(Boolean).join(" · ");
  return (
    <Vignette>
      <div className="flex gap-3">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          R
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">riftcaptain</span>
          <p className="text-primary text-sm font-medium">
            {/* One step per character, since the card the sample names sets
                the length. */}
            <span
              className="motion-safe:animate-vignette-type inline-block"
              style={{ animationTimingFunction: `steps(${reference.length}, end)` }}
            >
              {reference}
            </span>
          </p>
        </div>
      </div>
      <div className="motion-safe:animate-vignette-reply flex gap-3">
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
          <svg role="img" viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
            <path d={siDiscord.path} />
          </svg>
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">OpenRift</span>
            <Badge variant="subtle">BOT</Badge>
          </div>
          <div
            className="bg-background/40 flex flex-col gap-2.5 rounded-md border-l-4 px-3 py-2.5"
            style={{ borderLeftColor: EMBED_ACCENT }}
          >
            <span className="text-primary font-medium">{name}</span>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">On tradelists in Thursday store crew</span>
              {holders(shortCode).map((holder) => (
                <div key={holder.name} className="flex flex-col">
                  <span className="text-sm">
                    {holder.name} · {holder.quantity}
                  </span>
                  <span className="text-muted-foreground text-xs">{holder.detail}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {PRICE_FIELDS.map((field) => (
                <EmbedField key={field.name} name={field.name} value={field.value} />
              ))}
            </div>
            {named && (
              // Cropped to the artwork: the embed image is the card the footer
              // names, and a whole card face would run taller than the reply.
              <img
                src={named.url}
                alt=""
                loading="lazy"
                draggable={false}
                className="aspect-[16/9] w-full rounded-md object-cover object-top"
              />
            )}
            <span className="text-muted-foreground text-xs">{footer}</span>
          </div>
          <div className="bg-muted text-muted-foreground w-fit rounded-md px-3 py-1 text-xs font-medium">
            Details
          </div>
        </div>
      </div>
    </Vignette>
  );
}
