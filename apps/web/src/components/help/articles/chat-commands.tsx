import { Heading } from "@/components/heading";
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

export default function ChatCommandsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Add one command to your chat bot and viewers can look up any Riftbound card without leaving
        chat. They type <InlineCode>!card Jinx</InlineCode> and the bot answers with the card and a
        link to its page. If nothing matches, the reply links to a card search for what they typed,
        so even a typo lands somewhere useful.
      </p>

      <section>
        <Heading className="mb-2">Pick your bot</Heading>
        <p className="text-muted-foreground">
          Each line below is pasted verbatim, either into your own chat as a moderator or into the
          bot&apos;s dashboard. Nothing to install and no account needed.
        </p>
        <div className="mt-4">
          <ChatBotSetups />
        </div>
      </section>
    </div>
  );
}

function InlineCode({ children }: { children: string }) {
  return <code className="bg-muted rounded-md px-1 py-0.5 font-mono text-sm">{children}</code>;
}
