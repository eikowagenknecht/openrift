import type { DeckCheckKeyResponse } from "@openrift/shared";
import { CheckIcon, CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { SECTION_HEADING } from "@/components/friend-groups/friend-group-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDeckCheckKeys,
  useMintDeckCheckKey,
  useRenameDeckCheckKey,
  useRevokeDeckCheckKey,
} from "@/hooks/use-deck-check";
import { getSiteUrl } from "@/lib/site-config";

const EXAMPLE_PAYLOAD = `{
  "eventId": "<the event id, shown on the event page>",
  "entries": [
    {
      "externalId": "1234",
      "playerName": "A. Player",
      "playerEmail": "player@example.com",
      "riotId": "Player#EUW",
      "submittedAt": "2026-06-18T20:00:00Z",
      "allowNameSharing": true,
      "allowRiotIdSharing": true,
      "withdrawn": false,
      "cards": [
        { "name": "Darius, Trifarian", "quantity": 1, "section": "champion" },
        { "name": "Blazing Scorcher", "quantity": 3, "section": "main" }
      ]
    }
  ]
}`;

/**
 * ISO date (YYYY-MM-DD) from an ISO timestamp.
 * @returns The date part of the timestamp.
 */
function isoDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Admin-only API-key management plus the integration details an organizer
 * needs to send entrant decklists to this group.
 * @returns The API-keys settings section.
 */
export function DeckCheckKeysSection({ slug }: { slug: string }) {
  const { data } = useDeckCheckKeys(slug, true);
  const [createOpen, setCreateOpen] = useState(false);
  const [mintedToken, setMintedToken] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className={SECTION_HEADING}>API keys</h2>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <PlusIcon className="size-4" />
          Create key
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        An API key lets another website or tool send entrant decklists to this group, for example
        the site where players submit their lists. Lists it sends again are updated in place; lists
        it leaves out stay untouched.
      </p>

      {data && data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.items.map((key) => (
            <KeyRow key={key.id} slug={slug} apiKey={key} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No keys yet.</p>
      )}

      <details>
        <summary className="text-muted-foreground cursor-pointer text-sm">
          How to send decklists
        </summary>
        <div className="mt-2 flex flex-col gap-2 text-sm">
          <p>
            Send a POST request to{" "}
            <code className="break-all">{getSiteUrl()}/api/v1/ingest/deck-check</code> with the
            header <code>Authorization: Bearer &lt;your key&gt;</code> and a JSON body like this:
          </p>
          <p>
            Pushes can only fill events that already exist: create the event here first, then copy
            its id from the event page (next to the name) into <code>eventId</code>. The{" "}
            <code>externalId</code> of an entry is your own id for that player, so sending it again
            updates the same entry. <code>playerEmail</code>, <code>riotId</code>, and{" "}
            <code>submittedAt</code> (when the player turned in the list) are optional and shown to
            judges next to the name.
          </p>
          <p>
            <code>allowNameSharing</code> and <code>allowRiotIdSharing</code> record whether the
            player agreed to their name or Riot ID being shown on public platforms. Send{" "}
            <code>false</code> when the player declined; leaving a flag out keeps what is stored
            (new entries default to allowed). Leaving an entry out of a push never withdraws it: to
            withdraw a player, send the entry with <code>withdrawn</code> set to <code>true</code>;
            sending it again without the flag restores it.
          </p>
          <p>
            Valid card sections are <code>legend</code>, <code>champion</code>, <code>main</code>,{" "}
            <code>runes</code>, <code>battlefield</code>, <code>sideboard</code>, and{" "}
            <code>overflow</code>. Common variants like <code>deck</code>, <code>maindeck</code>,{" "}
            <code>side</code>, and plural forms work too; anything else rejects the push.
          </p>
          <pre className="bg-muted overflow-x-auto rounded-md p-3">{EXAMPLE_PAYLOAD}</pre>
        </div>
      </details>

      <CreateKeyDialog
        slug={slug}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onMinted={setMintedToken}
      />
      <MintedKeyDialog token={mintedToken} onClose={() => setMintedToken(null)} />
    </section>
  );
}

function CreateKeyDialog({
  slug,
  open,
  onOpenChange,
  onMinted,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMinted: (token: string) => void;
}) {
  const [label, setLabel] = useState("");
  const mintKey = useMintDeckCheckKey();

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    const result = await mintKey.mutateAsync({ slug, label: trimmed });
    setLabel("");
    onOpenChange(false);
    onMinted(result.token);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setLabel("");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Give the key a name that tells you where it is used, so you can later recognize which
            one to revoke.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deck-check-key-label">Name</Label>
          <Input
            id="deck-check-key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreate();
              }
            }}
            placeholder="Registration website"
            maxLength={120}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={mintKey.isPending || !label.trim()}>
            {mintKey.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ slug, apiKey }: { slug: string; apiKey: DeckCheckKeyResponse }) {
  const revokeKey = useRevokeDeckCheckKey();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const revoked = apiKey.revokedAt !== null;

  return (
    <div className="bg-card flex items-center gap-3 rounded-md border p-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {apiKey.label ?? "Unnamed key"}{" "}
          <code className="text-muted-foreground font-normal">{apiKey.tokenPrefix}…</code>
        </span>
        <span className="text-muted-foreground text-sm">
          Created {isoDay(apiKey.createdAt)}
          {apiKey.createdByName ? ` by ${apiKey.createdByName}` : ""}
          {apiKey.lastUsedAt ? ` · last used ${isoDay(apiKey.lastUsedAt)}` : " · never used"}
        </span>
      </div>
      {revoked ? (
        <Badge variant="secondary">Revoked</Badge>
      ) : (
        <>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Rename key"
            onClick={() => setRenameOpen(true)}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Revoke
          </Button>
        </>
      )}
      <RenameKeyDialog slug={slug} apiKey={apiKey} open={renameOpen} onOpenChange={setRenameOpen} />
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke this key?"
        description="Anything still using it will no longer be able to send decklists."
        confirmLabel="Revoke"
        pendingLabel="Revoking..."
        isPending={revokeKey.isPending}
        onConfirm={async () => {
          await revokeKey.mutateAsync({ slug, keyId: apiKey.id });
          setConfirmOpen(false);
          toast.success("Key revoked");
        }}
      />
    </div>
  );
}

function RenameKeyDialog({
  slug,
  apiKey,
  open,
  onOpenChange,
}: {
  slug: string;
  apiKey: DeckCheckKeyResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [label, setLabel] = useState(apiKey.label ?? "");
  const renameKey = useRenameDeckCheckKey();

  const handleRename = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === apiKey.label) {
      onOpenChange(false);
      return;
    }
    await renameKey.mutateAsync({ slug, keyId: apiKey.id, label: trimmed });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setLabel(apiKey.label ?? "");
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename key</DialogTitle>
        </DialogHeader>
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleRename();
            }
          }}
          maxLength={120}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRename} disabled={renameKey.isPending || !label.trim()}>
            {renameKey.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MintedKeyDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <Dialog
      open={token !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API key created</DialogTitle>
          <DialogDescription>
            Copy it now and store it where it will be used. For security, it is never shown again.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">{token}</div>
        <DialogFooter>
          <Button
            onClick={async () => {
              if (token) {
                await navigator.clipboard.writeText(token);
                setCopied(true);
              }
            }}
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
