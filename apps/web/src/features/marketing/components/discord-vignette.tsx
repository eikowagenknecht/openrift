import { siDiscord } from "simple-icons";

import { Badge } from "@/components/ui/badge";
import type { LandingThumbnailCard } from "@/features/marketing/lib/landing-thumbnails";

import { Vignette } from "./vignette-parts";

const EMBED_ACCENT = "#24705F";

const PRICE_FIELDS = [
  { name: "TCGplayer", value: "$4.52" },
  { name: "Cardmarket", value: "€3.80" },
  { name: "CardTrader", value: "€3.65" },
] as const;

// Fallback for when the daily-cached sample predates the art-identity fields.
const UNNAMED = { name: "Jinx, Rebel", shortCode: "OGN-202" };

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
