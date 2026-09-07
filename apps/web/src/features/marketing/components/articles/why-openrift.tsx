import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeftIcon,
  Code2Icon,
  HammerIcon,
  HeartIcon,
  SproutIcon,
  ZapIcon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { FeatureCard } from "@/features/marketing/components/article-cards";
import { DefinitionList, DefinitionRow } from "@/features/marketing/components/definition-list";
import { SOCIAL_LINKS } from "@/lib/social-links";

export default function WhyOpenRiftArticle() {
  return (
    <div className="space-y-8">
      <section>
        <Heading className="mb-3">Why this exists</Heading>
        <div className="text-muted-foreground space-y-3">
          <p>Honestly? I just wanted to track my collection.</p>
          <p>
            I used the existing Riftbound trackers for months, and each one was missing something I
            needed. Eventually I stopped waiting for someone else to build it and built the tool I
            wanted. It has become the app I use every day for my own cards.
          </p>
          <p>
            I know how that sounds: the world didn&apos;t ask for yet another collection tracker.
            The honest answer to &quot;why not improve an existing one instead?&quot; is that none
            of them are open source, so there was nothing to contribute to. OpenRift is, and it
            imports from and exports to the formats the other tools use, so you can bring your
            collection over in minutes, and take it back out just as easily.
          </p>
          <p>
            It&apos;s not just me, either. My local game store group uses it every day, for example
            to run our shared &quot;bulk box&quot;: a group collection of spare cards where taking a
            card out moves it straight into your own collection. A good part of the{" "}
            <Link to="/roadmap" className="text-primary hover:underline">
              roadmap
            </Link>{" "}
            started as their feature requests.
          </p>
          <p>
            The fair question to ask any new fan project is whether it will still be around next
            year. I can&apos;t promise the future, but I can point at a track record: the{" "}
            <Link to="/changelog" className="text-primary hover:underline">
              changelog
            </Link>{" "}
            shows what has shipped week by week since launch, my play group depends on the app
            daily, and my own collection lives here too. As long as I play Riftbound, OpenRift gets
            maintained.
          </p>
        </div>
      </section>

      <section>
        <Heading className="mb-3">What this site is (and isn&apos;t)</Heading>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Code2Icon className="size-4" />}
            title="Open source"
            description={
              <>
                Full source code on{" "}
                <a
                  href={SOCIAL_LINKS.githubRepo}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  GitHub
                </a>{" "}
                under AGPL-3.0. Inspect, fork, self-host, or open an issue. I read every single one.
              </>
            }
          />
          <FeatureCard
            icon={<ArrowRightLeftIcon className="size-4" />}
            title="No lock-in"
            description="Import and export collections and decks in formats any other tool can read. If OpenRift ever stops working for you, taking your data elsewhere is easy."
          />
          <FeatureCard
            icon={<HeartIcon className="size-4" />}
            title="Private groups"
            description="Form a private group with friends or your local store crew: shared collections (my play group runs its bulk box of spares this way) and trade matching that shows who has cards from your wishlists. The trade itself happens in person."
          />
          <FeatureCard
            icon={<ZapIcon className="size-4" />}
            title="Built for speed"
            description="Speed is the main design goal: browsing the catalog and editing decks should feel instant, on desktop and on your phone. If you catch a slow screen anywhere, that's a bug I want to hear about."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-3">Where OpenRift is catching up</Heading>
        <p className="text-muted-foreground mb-3">
          An honest pitch names the gaps too. Two things first, because no feature list captures
          them:
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            variant="dashed"
            icon={<SproutIcon className="size-4" />}
            title="New kid on the block"
            description="OpenRift is new and small. Most Riftbound players are on Piltover Archive today, and that's earned. The upside of being early here: your feature request isn't one voice among thousands. It gets read, and if it fits, it shapes the roadmap."
          />
          <FeatureCard
            variant="dashed"
            icon={<HammerIcon className="size-4" />}
            title="Less time in the wild"
            description="More than 12,000 automated tests and daily use keep the quality up, but years of real users find edge cases no test suite does. If you hit one, tell me: fixes ship fast."
          />
        </div>
        <p className="text-muted-foreground mt-4 mb-2">
          And credit where it&apos;s due: the other tools genuinely do some things better.
        </p>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-foreground font-medium">Piltover Archive</span> has bulk adding of
            cards, a massive library of user and tournament decklists, and by far the biggest
            community.
          </li>
          <li>
            <span className="text-foreground font-medium">Riftbound.gg</span> has aggregate
            tournament statistics plus a steady stream of articles and guides, which OpenRift
            doesn&apos;t have.
          </li>
          <li>
            <span className="text-foreground font-medium">RiftCore</span> has AI-powered tools and
            an Android app in the Play Store.
          </li>
        </ul>
        <p className="text-muted-foreground mt-3">
          If one of those is the feature you need today, use that tool. OpenRift imports and exports
          in compatible formats, so you can run it alongside another tracker, or switch back and
          forth, whenever you like.
        </p>
      </section>

      <section>
        <Heading className="mb-3">What only OpenRift has</Heading>
        <p className="text-muted-foreground mb-3">
          These are OpenRift features with no counterpart on the other sites, as far as I know. For
          the full tour of everything the app does, unique or not, see the{" "}
          <Link to="/features" className="text-primary hover:underline">
            features page
          </Link>
          .
        </p>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-5">
          <li>
            <span className="text-foreground font-medium">Trade matching:</span> inside a private
            group, see who has cards from your wishlists (and who wants your spares), with one-tap
            requests and email alerts. The trade itself happens in person.
          </li>
          <li>
            <span className="text-foreground font-medium">Shared group collections:</span> pool
            spare cards into a collection the whole group can see and take from.
          </li>
          <li>
            <span className="text-foreground font-medium">Card lending:</span> lend a card to a
            friend and it stays in your collection, but stops counting for decks and trades until it
            comes back. A lending page tracks who has what, including cards you&apos;re borrowing.
          </li>
          <li>
            <span className="text-foreground font-medium">Deck boxes:</span> point a deck at the
            collection its cards physically live in. The deck page then fills the box from your
            copies, and flags what the box still holds that the deck no longer needs.
          </li>
          <li>
            <span className="text-foreground font-medium">
              <Link
                to="/help/$slug"
                params={{ slug: "deck-importer-extension" }}
                className="text-primary hover:underline"
              >
                Deck importer extension
              </Link>
              :
            </span>{" "}
            a Firefox add-on that reads the decklist on whatever site you are looking at and hands
            it to the import page, name and source link included. No copying, no export step, and it
            works while you are logged out.
          </li>
          <li>
            <span className="text-foreground font-medium">Tournament organizer tools:</span> run a
            casual event yourself, with pod scoring and standings, deck submission via a per-event
            link, and judge deck-check tools.
          </li>
          <li>
            <span className="text-foreground font-medium">Match tracker:</span> keep score for two
            to four players during a game on your phone, with points, XP, and an undo for the
            mis-tapped ones. It works offline and saves nothing to your account.
          </li>
          <li>
            <span className="text-foreground font-medium">Discord bot:</span> look up a card, a
            deck, or a rule in your own server with a slash command or by writing{" "}
            <span className="font-mono">[[card name]]</span>, and post a group&apos;s tradelists
            into a channel.
          </li>
          <li>
            <span className="text-foreground font-medium">Quick card entry:</span> add cards by name
            from a fast keyboard palette, without browsing: type, press Enter to add, Shift+Enter to
            undo.
          </li>
          <li>
            <span className="text-foreground font-medium">Completion curve:</span> a chart showing
            which missing cards give you the most completion progress if added next.
          </li>
          <li>
            <span className="text-foreground font-medium">Pack opener simulator:</span> open virtual
            boosters at the real published pull rates, one card at a time or a whole display.
          </li>
          <li>
            <span className="text-foreground font-medium">Custom card designer:</span> design your
            own Riftbound-style card with your own artwork, entirely in your browser.
          </li>
        </ul>
      </section>

      <section>
        <Heading className="mb-3">Tech stack</Heading>
        <p className="text-muted-foreground mb-3">
          For the technically curious, or if you&apos;re thinking about contributing:
        </p>
        <DefinitionList>
          <DefinitionRow label="Runtime">
            <TechLink href="https://bun.com">Bun</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Language">
            <TechLink href="https://www.typescriptlang.org">TypeScript</TechLink> end-to-end, linted
            with <TechLink href="https://oxc.rs">oxlint + oxfmt</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Frontend">
            <TechLink href="https://react.dev">React 19</TechLink> with React Compiler, built with{" "}
            <TechLink href="https://vite.dev">Vite</TechLink>
          </DefinitionRow>
          <DefinitionRow label="TanStack">
            <TechLink href="https://tanstack.com/start">Start</TechLink> (SSR),{" "}
            <TechLink href="https://tanstack.com/router">Router</TechLink>,{" "}
            <TechLink href="https://tanstack.com/query">Query</TechLink>,{" "}
            <TechLink href="https://tanstack.com/db">DB</TechLink>,{" "}
            <TechLink href="https://tanstack.com/table">Table</TechLink>,{" "}
            <TechLink href="https://tanstack.com/virtual">Virtual</TechLink>,{" "}
            <TechLink href="https://tanstack.com/hotkeys">Hotkeys</TechLink>
          </DefinitionRow>
          <DefinitionRow label="UI">
            <TechLink href="https://tailwindcss.com">Tailwind CSS</TechLink> +{" "}
            <TechLink href="https://ui.shadcn.com">shadcn/ui</TechLink> +{" "}
            <TechLink href="https://base-ui.com">BaseUI</TechLink> primitives
          </DefinitionRow>
          <DefinitionRow label="State & forms">
            <TechLink href="https://zustand.docs.pmnd.rs">Zustand</TechLink>,{" "}
            <TechLink href="https://react-hook-form.com">React Hook Form</TechLink>,{" "}
            <TechLink href="https://zod.dev">Zod</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Backend">
            <TechLink href="https://hono.dev">Hono</TechLink> +{" "}
            <TechLink href="https://orpc.unnoq.com">oRPC</TechLink> +{" "}
            <TechLink href="https://www.better-auth.com">better-auth</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Database">
            <TechLink href="https://www.postgresql.org">PostgreSQL</TechLink> via{" "}
            <TechLink href="https://kysely.dev">Kysely</TechLink>
          </DefinitionRow>
          <DefinitionRow label="Monorepo">
            <TechLink href="https://turborepo.com">Turborepo</TechLink> (web, api, shared)
          </DefinitionRow>
          <DefinitionRow label="Quality">
            <TechLink href="https://vitest.dev">Vitest</TechLink> +{" "}
            <TechLink href="https://playwright.dev">Playwright</TechLink> +{" "}
            <TechLink href="https://sentry.io">Sentry</TechLink>
          </DefinitionRow>
        </DefinitionList>
      </section>
    </div>
  );
}

function TechLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
      {children}
    </a>
  );
}
