import { siDiscord } from "simple-icons";

import { Badge } from "@/components/ui/badge";

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

// Two lines per holder: the name and count, then a Discord "-#" subtext line
// of printings. A repeated public code drops off the second entry.
const HOLDERS = [
  { name: "Alice", quantity: "2×", detail: "OGN-202/298 2× (Binder)" },
  {
    name: "Thogrim",
    quantity: "2×",
    detail: "OGN-202/298 Standard 1× (Binder) · Alt Art 1× (Trades)",
  },
] as const;

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
 * @returns The Discord vignette.
 */
export function DiscordVignette({ thumbnailUrl }: { thumbnailUrl?: string }) {
  return (
    <Vignette>
      <div className="flex gap-3">
        <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          R
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">riftcaptain</span>
          <p className="text-primary text-sm font-medium">
            <span className="motion-safe:animate-vignette-type inline-block">[[Jinx, Rebel]]</span>
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
            <span className="text-primary font-medium">Jinx, Rebel</span>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold">On tradelists in Thursday store crew</span>
              {HOLDERS.map((holder) => (
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
            {thumbnailUrl && (
              // Cropped to the artwork: the embed image is the card the footer
              // names, and the daily thumbnail sample cannot be asked for a
              // specific one.
              <img
                src={thumbnailUrl}
                alt=""
                loading="lazy"
                draggable={false}
                className="aspect-[16/9] w-full rounded object-cover object-top"
              />
            )}
            <span className="text-muted-foreground text-xs">OGN-202/298 · Origins</span>
          </div>
          <div className="bg-muted text-muted-foreground w-fit rounded px-3 py-1 text-xs font-medium">
            Details
          </div>
        </div>
      </div>
    </Vignette>
  );
}
