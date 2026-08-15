import { CreatorSection } from "@/components/creators/creator-section";
import { CopyField } from "@/components/ui/copy-field";
import { Skeleton } from "@/components/ui/skeleton";
import { useHydrated } from "@/hooks/use-hydrated";
import { chatBotSetups } from "@/lib/creator-chat-commands";
import { getSiteUrl } from "@/lib/site-config";

/**
 * The setup lines, rendered only after hydration.
 *
 * Everything else on this page server-renders, but a bot command has to carry
 * an absolute URL, and the only source for one is `getSiteUrl()` — which reads
 * `process.env.SITE_URL` on the server and `window.location.origin` on the
 * client. Those can disagree, and this app hydrates the whole document, so a
 * disagreement is a React #418 that takes out the page rather than one line of
 * text. Rendering the commands client-side sidesteps it; the prose around them
 * still reaches crawlers.
 *
 * @returns The per-bot copy rows, or their placeholder during SSR.
 */
function ChatBotSetups() {
  const hydrated = useHydrated();

  if (!hydrated) {
    return <Skeleton className="h-52" />;
  }

  return (
    <div className="flex flex-col gap-5">
      {chatBotSetups(getSiteUrl()).map((setup) => (
        <div key={setup.id} className="flex flex-col gap-2">
          <h3 className="font-medium">{setup.name}</h3>
          <CopyField value={setup.command} label={`${setup.name} command`} mono />
          <p className="text-muted-foreground text-sm">{setup.note}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * How a creator wires the plain-text lookup into their chat bot.
 *
 * @returns The chat command section.
 */
export function CreatorChatSection() {
  return (
    <CreatorSection id="chat-command" title="Card lookups in chat">
      <p>
        Add one command to your chat bot and viewers can look up any Riftbound card without leaving
        the stream. Someone types <code className="font-mono text-sm">!card viktor</code> and the
        bot answers with the card&apos;s type, domains and stats, plus a link to the full card page.
        A printing code works too, with or without the dash.
      </p>
      <p>
        If nothing matches, the bot links to a card search for what they typed, so even a typo lands
        somewhere useful.
      </p>
      <ChatBotSetups />
      <p>
        The lookup is free, with no account or API key needed. It reads the same catalogue as the
        rest of the site, so fixes to card data show up on the next lookup.
      </p>
    </CreatorSection>
  );
}
