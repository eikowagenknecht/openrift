import { formatDay } from "@openrift/shared/format-date";
import { BotIcon, CheckIcon, CopyIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCreateFriendGroupDiscordLinkCode,
  useDeleteFriendGroupDiscordLink,
  useFriendGroupDiscordLinks,
} from "@/features/groups/hooks/use-friend-group-discord";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

// While a code is outstanding the links list polls, so the redeem shows up without a reload.
export function DiscordPanel({ slug }: { slug: string }) {
  const createCode = useCreateFriendGroupDiscordLinkCode();
  const removeLink = useDeleteFriendGroupDiscordLink();
  const [pending, setPending] = useState<{
    code: string;
    knownLinkIds: string[];
  } | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const { data } = useFriendGroupDiscordLinks(slug, {
    refetchInterval: pending === null ? undefined : 5000,
  });
  const redeemed =
    pending !== null && data.items.some((item) => !pending.knownLinkIds.includes(item.id));

  async function handleGenerate() {
    try {
      const result = await createCode.mutateAsync(slug);
      setPending({ code: result.code, knownLinkIds: data.items.map((item) => item.id) });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BotIcon className="size-4" />
          Discord bot
        </CardTitle>
        <CardDescription>
          The OpenRift bot answers card mentions in the linked server with who has the card on a
          shared tradelist. Anyone who can read that server sees those names and counts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{item.guildName ?? `Server ${item.guildId}`}</span>
              <span className="text-muted-foreground text-sm">
                linked {formatDay(item.linkedAt)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => removeLink.mutate({ slug, linkId: item.id })}
              disabled={removeLink.isPending}
            >
              <Trash2Icon className="size-4" />
              Unlink
            </Button>
          </div>
        ))}
        {data.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No server linked yet.</p>
        ) : null}
        {pending === null ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleGenerate()}
              disabled={createCode.isPending}
            >
              Generate link code
            </Button>
          </div>
        ) : redeemed ? (
          <p className="text-sm">Server linked. Card mentions there now include tradelists.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              In your Discord server, run this command within 15 minutes (you need the Manage Server
              permission there):
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted rounded-md px-2 py-1 font-mono text-sm">
                /link code:{pending.code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void copy(`/link code:${pending.code}`)}
              >
                {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
