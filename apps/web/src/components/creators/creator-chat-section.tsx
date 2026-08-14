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
        Add one command and anyone in your chat can pull up a Riftbound card without leaving the
        stream. A viewer types <code className="font-mono text-sm">!card viktor</code> and the bot
        answers with the card&apos;s type, domains and stats, plus a link to the full card page. A
        printing code works too, with or without the dash.
      </p>
      <p className="text-muted-foreground">
        When nothing matches, the answer points at a card search for whatever they asked for, so a
        typo still gets them somewhere useful.
      </p>
      <ChatBotSetups />
      <p className="text-muted-foreground text-sm">
        The lookup is free and needs no account or key. It reads the same catalogue the site does,
        so a card edit shows up on the next lookup.
      </p>
    </CreatorSection>
  );
}
