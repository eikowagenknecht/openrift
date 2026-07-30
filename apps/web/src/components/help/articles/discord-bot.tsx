import { BookOpenTextIcon, CoinsIcon, MessageSquareTextIcon, SlashSquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Heading } from "@/components/heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { SOCIAL_LINKS } from "@/lib/social-links";

export default function DiscordBotArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        The OpenRift bot brings card and rules lookups into your Discord server. Ask for any card
        and it replies with the card image, current prices, and a link to the full card page, right
        where you&apos;re already talking about your next deck. Rules questions get the exact rule
        quoted in chat.
      </p>

      {/* Adding the bot */}
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

      {/* Slash command */}
      <section>
        <Heading className="mb-2">Look up a card with /card</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OptionCard
            icon={<SlashSquareIcon className="size-4" />}
            title="Card name with suggestions"
            description="Type /card and start writing a name. Suggestions narrow as you type, and spelling details like apostrophes don't matter."
          />
          <OptionCard
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

      {/* Rules lookup */}
      <section>
        <Heading className="mb-2">Quote a rule with /rule</Heading>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OptionCard
            icon={<SlashSquareIcon className="size-4" />}
            title="By number or keyword"
            description="Type /rule with a rule number like CR 103.1 or a game term like stun. Suggestions show the start of each rule so you can pick the right one, and plain words search the full rules text."
          />
          <OptionCard
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

      {/* Inline references */}
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

      {/* Prices */}
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
  return <code className="bg-muted rounded px-1 py-0.5 font-mono text-sm">{children}</code>;
}

function StepRow({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3">
        <span className="bg-primary/10 text-primary flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
          {step}
        </span>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="flex gap-3">
        <span className="text-primary mt-0.5 shrink-0">{icon}</span>
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardContent>
    </Card>
  );
}
