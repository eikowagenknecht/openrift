import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { CheckIcon, CopyIcon, KeyRoundIcon, LoaderIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiKeySummary } from "@/hooks/use-api-keys";
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from "@/hooks/use-api-keys";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { formatAbsoluteDate } from "@/lib/format-date";

/**
 * Formats a better-auth date (a Date on the type, an ISO string on the wire).
 *
 * @returns The formatted date, or "—" when null.
 */
function keyDate(value: Date | string | null): string {
  if (!value) {
    return "—";
  }
  const iso = typeof value === "string" ? value : value.toISOString();
  return formatAbsoluteDate(iso);
}

function CreatedKeyDialog({ createdKey, onClose }: { createdKey: string; onClose: () => void }) {
  // A secret, not a share link, so this stays a plain copy button rather than a
  // ShareLinkRow — the key must never end up in a QR.
  const { copied: justCopied, copy } = useCopyToClipboard();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API key created</DialogTitle>
          <DialogDescription>
            This is the only time the key is shown — only a hash is stored. Copy it now.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-muted rounded-md p-3 font-mono text-sm break-all select-all">
          {createdKey}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy(createdKey)}>
            {justCopied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {justCopied ? "Copied" : "Copy key"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteKeyButton({ apiKey }: { apiKey: ApiKeySummary }) {
  const deleteKey = useDeleteApiKey();

  async function handleDelete() {
    try {
      await deleteKey.mutateAsync({ keyId: apiKey.id });
      toast.success("API key revoked");
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        disabled={deleteKey.isPending}
        render={<Button size="sm" variant="ghost" aria-label="Revoke key" />}
      >
        <TrashIcon className="size-4" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <DialogForm onSubmit={handleDelete}>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{apiKey.name ?? apiKey.start}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Scripts using this key stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogPrimitive.Close render={<Button type="submit" variant="destructive" />}>
              Revoke
            </AlertDialogPrimitive.Close>
          </AlertDialogFooter>
        </DialogForm>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ApiKeysPage() {
  const { data: keys, isPending } = useApiKeys();
  const createKey = useCreateApiKey();
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    try {
      const created = await createKey.mutateAsync({ name: trimmed });
      setName("");
      setCreatedKey(created.key);
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageTopBar title="API Keys" />

      <Card>
        <CardHeader>
          <CardTitle>Create key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            API keys let scripts call the API without a browser session: send the key as an{" "}
            <code className="font-mono">x-api-key</code> header and the request runs as your
            account, with all of its permissions. Keys don&apos;t expire, but each is limited to
            1000 requests per hour.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleCreate()}
                placeholder="e.g. upload-script"
                className="w-56"
              />
            </div>
            <Button onClick={handleCreate} disabled={!name.trim() || createKey.isPending}>
              {createKey.isPending ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <PlusIcon className="size-4" />
              )}
              Create key
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : !keys || keys.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>No API keys</EmptyTitle>
                <EmptyDescription>
                  Keys you create appear here. Only the first characters are kept for display.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>{key.name ?? "—"}</TableCell>
                    <TableCell className="font-mono">{key.start ? `${key.start}…` : "—"}</TableCell>
                    <TableCell>{keyDate(key.createdAt)}</TableCell>
                    <TableCell>{keyDate(key.lastRequest)}</TableCell>
                    <TableCell className="text-right tabular-nums">{key.requestCount}</TableCell>
                    <TableCell className="text-right">
                      <DeleteKeyButton apiKey={key} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createdKey && (
        <CreatedKeyDialog createdKey={createdKey} onClose={() => setCreatedKey(null)} />
      )}
    </div>
  );
}
