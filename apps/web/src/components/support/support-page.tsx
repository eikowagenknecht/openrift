import { CopyIcon, HeartIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { siDiscord, siGithubsponsors, siKofi, siReddit, siX } from "simple-icons";

import { CardText } from "@/components/cards/card-text";
import { MarketplaceLink } from "@/components/marketplace-link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING } from "@/lib/utils";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/eikowagenknecht";
const KOFI_URL = "https://ko-fi.com/eikowagenknecht";

interface SupportTier {
  rarity: string;
  price: string;
  effect: string;
  rarityImage: string;
}

const tiers: SupportTier[] = [
  {
    rarity: "common",
    price: "$1/mo",
    effect: "I see you over there. [Reaction]: I nod in your general direction.",
    rarityImage: "/images/rarities/common.webp",
  },
  {
    rarity: "uncommon",
    price: "$3/mo",
    effect: "A warm fuzzy feeling. [Shield]: Protects me from existential dread for 72 hours.",
    rarityImage: "/images/rarities/uncommon.webp",
  },
  {
    rarity: "rare",
    price: "$5/mo",
    effect: "My server gains +1 :rb_might:. It survives approximately 4.7 more minutes per month.",
    rarityImage: "/images/rarities/rare.webp",
  },
  {
    rarity: "epic",
    price: "$10/mo",
    effect: "You're keeping the lights on. [Deathknell]: I name a bug after you.",
    rarityImage: "/images/rarities/epic.webp",
  },
  {
    rarity: "showcase",
    price: "$25/mo",
    effect:
      "You basically own the site now. [Buff]: My morale goes through the roof. A sticker may or may not materialize.",
    rarityImage: "/images/rarities/showcase.webp",
  },
];

function SimpleIcon({ icon, className }: { icon: { path: string }; className?: string }) {
  return (
    <svg role="img" viewBox="0 0 24 24" className={cn("size-4 fill-current", className)}>
      <path d={icon.path} />
    </svg>
  );
}

function TierCard({ tier }: { tier: SupportTier }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img src={tier.rarityImage} alt={tier.rarity} width={28} height={28} className="size-5" />
          <span>{tier.rarity}</span>
          <span className="text-muted-foreground ml-auto text-sm font-normal">{tier.price}</span>
        </CardTitle>
        <CardDescription className="italic">
          <Suspense fallback={tier.effect}>
            <CardText text={tier.effect} interactive={false} />
          </Suspense>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ShareButton({
  label,
  icon,
  onClick,
  href,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        <Button variant="outline" size="lg" className="w-full gap-2">
          {icon}
          {label}
        </Button>
      </a>
    );
  }

  return (
    <Button variant="outline" size="lg" className="w-full gap-2" onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function CopyButton({ text, label, icon }: { text: string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return <ShareButton label={copied ? "Copied!" : label} icon={icon} onClick={handleCopy} />;
}

export function SupportPage() {
  const siteUrl = getSiteUrl();
  const shareText = `Check out OpenRift, a free card browser for Riftbound! ${siteUrl}`;
  const tweetText = encodeURIComponent(shareText);

  return (
    <div className={`mx-auto flex w-full max-w-2xl flex-1 flex-col ${PAGE_PADDING}`}>
      {/* Hero */}
      <div className="mb-10">
        <h1 className="mb-4 text-2xl font-bold">Support the Rift</h1>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            Every day, my server burns Energy to keep the Rift open so you can browse cards instead
            of whatever you were supposed to be doing.
          </p>
          <p>
            This site has no ads, no trackers, and no venture capital guys asking about my
            &ldquo;growth metrics.&rdquo; Just me, a database, and an alarming hosting bill. (Just
            kidding, this is running on a Hetzner CX23 found in a Falkenstein scrapyard. But
            upgrading it would be nice.)
          </p>
          <p>
            You can help. Or don&apos;t. I&apos;ll just be here. In the basement. Waiting for
            reinforcements.
          </p>
        </div>
      </div>

      {/* Donate */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Fuel the Rift</h2>
        <p className="text-muted-foreground mb-4 text-sm">Add Energy to the pool.</p>
        <div className="space-y-3">
          {tiers.map((tier) => (
            <TierCard key={tier.rarity} tier={tier} />
          ))}
        </div>
        <p className="text-muted-foreground mt-3 text-center text-xs italic">
          These tiers are purely cosmetic. Like foils, but for your soul.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants(), "gap-2")}
          >
            <SimpleIcon icon={siKofi} className="size-4" />
            Support on Ko-fi
          </a>
          <a
            href={GITHUB_SPONSORS_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
          >
            <SimpleIcon icon={siGithubsponsors} className="size-4" />
            Sponsor on GitHub
          </a>
        </div>
        <p className="text-muted-foreground mt-2 text-center text-sm">
          Recurring or one-time, every contribution helps keep the Rift open.
        </p>
      </section>

      {/* Share */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Widen the Rift</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Can&apos;t spare the Energy? Cast a sharing spell instead. Every share adds Power to the
          community.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <ShareButton
            label="Summon your X followers"
            icon={<SimpleIcon icon={siX} />}
            href={`https://x.com/intent/tweet?text=${tweetText}`}
          />
          <ShareButton
            label="Tell Reddit about OpenRift"
            icon={<SimpleIcon icon={siReddit} />}
            href={`https://reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent("OpenRift — free card browser for Riftbound")}`}
          />
          <CopyButton
            label="Send a Carrier Pigeon"
            icon={<CopyIcon className="size-4" />}
            text={shareText}
          />
        </div>
      </section>

      {/* Affiliate */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Shop Through the Rift</h2>
        <p className="text-muted-foreground text-sm">
          When you click a{" "}
          <MarketplaceLink
            marketplace="tcgplayer"
            href="https://partner.tcgplayer.com/openrift?u=https%3A%2F%2Fwww.tcgplayer.com%2F"
            className="text-primary underline-offset-4 hover:underline"
          >
            TCGplayer
          </MarketplaceLink>{" "}
          or{" "}
          <MarketplaceLink
            marketplace="cardtrader"
            href="https://www.cardtrader.com/?share_code=openrift"
            className="text-primary underline-offset-4 hover:underline"
          >
            Cardtrader
          </MarketplaceLink>{" "}
          link from a card&apos;s prices and end up buying something, I get a very small commission
          at no extra cost to you. (Cardmarket doesn&apos;t do this, so those links are just regular
          links.) Buying cards you were going to buy anyway through these links is a sneaky-easy way
          to help out.
        </p>
      </section>

      {/* Community */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Join the Party</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Got feedback, questions, or just want to talk cards? Come hang out on Discord.
        </p>
        <a
          href="https://discord.gg/Qb6RcjXq6z"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752C4]"
        >
          <SimpleIcon icon={siDiscord} className="size-4" />
          Join the Discord
        </a>
      </section>

      {/* Merch */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Gear Up</h2>
        <Card size="sm" className="border-dashed">
          <CardHeader>
            <CardTitle className="text-muted-foreground flex items-center gap-2 italic">
              Coming Soon&trade;
            </CardTitle>
            <CardDescription>
              My Gear department (population: one) is working on it. Check back before the heat
              death of the universe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm italic">
              <Suspense fallback="[Equip]: Attach one mass-produced mug to your desk. It reads: &ldquo;I fund the Rift and all I got was this Common-rarity mug.&rdquo;">
                <CardText
                  text='[Equip]: Attach one mass-produced mug to your desk. It reads: "I fund the Rift and all I got was this Common-rarity mug."'
                  interactive={false}
                />
              </Suspense>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Sign-off */}
      <section className="text-muted-foreground mt-auto border-t pt-6 text-center text-sm">
        <p>
          OpenRift is a free, open-source project. No one here is getting rich (well, except in
          Power, and you can&apos;t pay hosting bills with Power).
        </p>
        <p className="mt-2 font-medium">
          Built with Fury. Maintained with Calm. Funded by people like you.
        </p>
        <HeartIcon className="text-primary/40 mx-auto mt-4 size-5" />
      </section>
    </div>
  );
}
