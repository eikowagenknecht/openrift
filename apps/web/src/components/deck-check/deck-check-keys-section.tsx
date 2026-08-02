import type { DeckCheckKeyResponse } from "@openrift/shared";
import { CheckIcon, CopyIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
  useMintMyDeckCheckKey,
  useMintOrgDeckCheckKey,
  useMyDeckCheckKeys,
  useOrgDeckCheckKeys,
  useRemoveMyDeckCheckKey,
  useRemoveOrgDeckCheckKey,
  useRenameMyDeckCheckKey,
  useRenameOrgDeckCheckKey,
  useRevokeMyDeckCheckKey,
  useRevokeOrgDeckCheckKey,
} from "@/hooks/use-deck-check-keys";

/**
 * ISO date (YYYY-MM-DD) from an ISO timestamp.
 * @returns The date part of the timestamp.
 */
function isoDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** Bound key actions, supplied by the personal / org wrappers below. */
interface KeyActions {
  keys: DeckCheckKeyResponse[] | undefined;
  mint: (label: string) => Promise<string>;
  mintPending: boolean;
  rename: (keyId: string, label: string) => Promise<void>;
  revoke: (keyId: string) => Promise<void>;
  revokePending: boolean;
  remove: (keyId: string) => Promise<void>;
  removePending: boolean;
}

/**
 * Personal deck-check API keys (host = the current user). Keys here let a
 * provider push entrant decklists into the tournaments this account hosts.
 * @returns The personal API-keys card.
 */
export function MyDeckCheckKeysSection({ enabled = true }: { enabled?: boolean }) {
  const { data } = useMyDeckCheckKeys(enabled);
  const mintKey = useMintMyDeckCheckKey();
  const renameKey = useRenameMyDeckCheckKey();
  const revokeKey = useRevokeMyDeckCheckKey();
  const removeKey = useRemoveMyDeckCheckKey();
  return (
    <DeckCheckKeysCard
      keys={data?.items}
      mint={async (label) => {
        const result = await mintKey.mutateAsync({ label });
        return result.token;
      }}
      mintPending={mintKey.isPending}
      rename={async (keyId, label) => {
        await renameKey.mutateAsync({ keyId, label });
      }}
      revoke={async (keyId) => {
        await revokeKey.mutateAsync({ keyId });
      }}
      revokePending={revokeKey.isPending}
      remove={async (keyId) => {
        await removeKey.mutateAsync({ keyId });
      }}
      removePending={removeKey.isPending}
    />
  );
}

/**
 * Organization-owned deck-check API keys (owner/manager only). Keys here let a
 * provider push entrant decklists into the tournaments the org hosts.
 * @returns The org API-keys card.
 */
export function OrgDeckCheckKeysSection({
  orgId,
  enabled = true,
}: {
  orgId: string;
  enabled?: boolean;
}) {
  const { data } = useOrgDeckCheckKeys(orgId, enabled);
  const mintKey = useMintOrgDeckCheckKey();
  const renameKey = useRenameOrgDeckCheckKey();
  const revokeKey = useRevokeOrgDeckCheckKey();
  const removeKey = useRemoveOrgDeckCheckKey();
  return (
    <DeckCheckKeysCard
      keys={data?.items}
      mint={async (label) => {
        const result = await mintKey.mutateAsync({ orgId, label });
        return result.token;
      }}
      mintPending={mintKey.isPending}
      rename={async (keyId, label) => {
        await renameKey.mutateAsync({ orgId, keyId, label });
      }}
      revoke={async (keyId) => {
        await revokeKey.mutateAsync({ orgId, keyId });
      }}
      revokePending={revokeKey.isPending}
      remove={async (keyId) => {
        await removeKey.mutateAsync({ orgId, keyId });
      }}
      removePending={removeKey.isPending}
    />
  );
}

/**
 * The shared API-key management card plus the integration details an organizer
 * needs to send entrant decklists. Host-agnostic: the personal and org wrappers
 * supply the bound mutations.
 * @returns The API-keys settings card.
 */
function DeckCheckKeysCard(actions: KeyActions) {
  const { keys } = actions;
  const [createOpen, setCreateOpen] = useState(false);
  const [mintedToken, setMintedToken] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">API keys</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-4" />
            Create key
          </Button>
        </div>
        <CardDescription>
          An API key acts on your behalf and is allowed to do anything that you can do, limited to
          whatever the API exposes. For now the only available endpoint sends entrant decklists to
          your hosted tournaments.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {keys && keys.length > 0 ? (
          <div className="flex flex-col gap-2">
            {keys.map((key) => (
              <KeyRow key={key.id} apiKey={key} actions={actions} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No keys yet.</p>
        )}

        <CreateKeyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          onMint={(label) => actions.mint(label)}
          mintPending={actions.mintPending}
          onMinted={setMintedToken}
        />
        <MintedKeyDialog token={mintedToken} onClose={() => setMintedToken(null)} />
      </CardContent>
    </Card>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onMint,
  mintPending,
  onMinted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMint: (label: string) => Promise<string>;
  mintPending: boolean;
  onMinted: (token: string) => void;
}) {
  const [label, setLabel] = useState("");

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    const token = await onMint(trimmed);
    setLabel("");
    onOpenChange(false);
    onMinted(token);
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
        <DialogForm onSubmit={() => void handleCreate()}>
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
              placeholder="Registration website"
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mintPending || !label.trim()}>
              {mintPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({ apiKey, actions }: { apiKey: DeckCheckKeyResponse; actions: KeyActions }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const revoked = apiKey.revokedAt !== null;

  return (
    <Card className="flex-row items-center gap-3 p-3">
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
        <>
          <Badge variant="secondary">Revoked</Badge>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setRemoveOpen(true)}
          >
            Remove
          </Button>
        </>
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
      <RenameKeyDialog
        apiKey={apiKey}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onRename={(keyId, label) => actions.rename(keyId, label)}
      />
      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revoke this key?"
        description="Anything still using it will no longer be able to send decklists."
        confirmLabel="Revoke"
        pendingLabel="Revoking..."
        isPending={actions.revokePending}
        onConfirm={async () => {
          await actions.revoke(apiKey.id);
          setConfirmOpen(false);
          toast.success("Key revoked");
        }}
      />
      <ConfirmActionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove this key?"
        description="It is already revoked, so this just clears it from the list. This cannot be undone."
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={actions.removePending}
        onConfirm={async () => {
          await actions.remove(apiKey.id);
          setRemoveOpen(false);
          toast.success("Key removed");
        }}
      />
    </Card>
  );
}

function RenameKeyDialog({
  apiKey,
  open,
  onOpenChange,
  onRename,
}: {
  apiKey: DeckCheckKeyResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (keyId: string, label: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(apiKey.label ?? "");
  const [pending, setPending] = useState(false);

  const handleRename = async () => {
    const trimmed = label.trim();
    if (!trimmed || trimmed === apiKey.label) {
      onOpenChange(false);
      return;
    }
    setPending(true);
    try {
      await onRename(apiKey.id, trimmed);
      onOpenChange(false);
    } catch (error) {
      setPending(false);
      throw error;
    }
    setPending(false);
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
        <DialogForm onSubmit={() => void handleRename()}>
          <DialogHeader>
            <DialogTitle>Rename key</DialogTitle>
          </DialogHeader>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !label.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function MintedKeyDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const { copied, copy, reset } = useCopyToClipboard();

  return (
    <Dialog
      open={token !== null}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogForm
          onSubmit={() => {
            if (token) {
              void copy(token);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
            <DialogDescription>
              Copy it now and store it where it will be used. For security, it is never shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3 font-mono text-sm break-all">{token}</div>
          <DialogFooter>
            <Button type="submit">
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              {copied ? "Copied" : "Copy key"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
