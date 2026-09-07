import {
  BookOpenTextIcon,
  CoinsIcon,
  LayoutGridIcon,
  MessageSquareTextIcon,
  SlashSquareIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FeatureCard, StepRow } from "@/features/marketing/components/article-cards";
import { SOCIAL_LINKS } from "@/lib/social-links";

export default function DiscordBotArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        The OpenRift bot brings card lookups, deck codes, and rules into your Discord server. Ask
        for any card and it replies with the card image, current prices, and a link to the full card
        page, right where you&apos;re already talking about your next deck. Deck codes unfurl into a
        full decklist, and rules questions get the exact rule quoted in chat.
      </p>

      <section>
        <Heading className="mb-2">Add it to your server</Heading>
        <p className="text-muted-foreground">
          You need the <span className="font-medium">Manage Server</span> permission on the server
          you want to add the bot to.
        </p>
        <div className="mt-3 space-y-2">
          <StepRow
            step={1}
            title="Open the invite link"
            description="Use the button below and pick your server from the list."
          />
          <StepRow
            step={2}
            title="Authorize the bot"
            description="Leave the suggested permissions as they are: the bot only needs to read messages and reply with embeds."
          />
          <StepRow
            step={3}
            title="Try it out"
            description="Type /card in any channel, or mention a card like [[Jinx]] in a message."
          />
        </div>
        <p className="mt-3">
          <a
            href={SOCIAL_LINKS.discordBotInvite}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium hover:underline"
          >
            Add the OpenRift bot to your server
          </a>
        </p>
      </section>

      <section>
        <Heading className="mb-2">Look up a card with /card</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<SlashSquareIcon className="size-4" />}
            title="Card name with suggestions"
            description="Type /card and start writing a name. Suggestions narrow as you type, and spelling details like apostrophes don't matter."
          />
          <FeatureCard
            icon={<MessageSquareTextIcon className="size-4" />}
            title="Pick a printing (optional)"
            description="The printing box suggests every version of the chosen card, with the standard one marked as default. Pick one to see a specific set, art, or language."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Card numbers work too: <InlineCode>/card OGN-202</InlineCode> (or just{" "}
          <InlineCode>ogn202</InlineCode>) jumps straight to that exact printing.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Share a deck with /deck</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<SlashSquareIcon className="size-4" />}
            title="Paste a deck code"
            description="Type /deck and paste a deck code from an OpenRift deck's share dialog or from Piltover Archive. The reply names the deck after its Legend and lists every card grouped by zone."
          />
          <FeatureCard
            icon={<LayoutGridIcon className="size-4" />}
            title="Deck image and one-click import"
            description="The reply includes a rendered image of the whole deck and an Open in OpenRift button that loads the code straight into the deck importer."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Cards that aren&apos;t in the catalog yet are listed at the end of the decklist instead of
          being dropped silently. If the code doesn&apos;t decode, only you see the reply, so a typo
          never clutters the channel.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Quote a rule with /rule</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<SlashSquareIcon className="size-4" />}
            title="By number or keyword"
            description="Type /rule with a rule number like CR 103.1 or a game term like stun. Suggestions show the start of each rule so you can pick the right one, and plain words search the full rules text."
          />
          <FeatureCard
            icon={<BookOpenTextIcon className="size-4" />}
            title="Core and tournament rules"
            description="CR stands for the core rules, TR for the tournament rules. A plain number checks both, core rules first."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          The reply quotes the rule together with its sub-rules and links straight to that spot in
          the rules on OpenRift, so settling a mid-game dispute takes one message. Rules also work
          inline: mention <InlineCode>[[CR 103.1]]</InlineCode> or just{" "}
          <InlineCode>[[103.1]]</InlineCode> in a normal message and the bot quotes the rule, same
          as with cards.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Mention cards in chat</Heading>
        <p className="text-muted-foreground">
          Wrap a card name in double square brackets anywhere in a normal message, like{" "}
          <InlineCode>[[Doran&apos;s Shield]]</InlineCode>, and the bot replies with the card. Up to
          three cards per message, and a card number like <InlineCode>[[OGN-202]]</InlineCode> shows
          that exact printing. Names the bot doesn&apos;t recognize are simply ignored, so it never
          interrupts a conversation with error messages.
        </p>
      </section>

      <Alert>
        <CoinsIcon className="size-4" />
        <AlertDescription>
          Prices come from TCGplayer, Cardmarket, and CardTrader and refresh daily, in each
          marketplace&apos;s own currency. Some price links are affiliate links that support
          OpenRift at no extra cost to you.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="bg-muted rounded-md px-1 py-0.5 font-mono text-sm">{children}</code>;
}
