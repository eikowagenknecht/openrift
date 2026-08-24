import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { useResetCollections } from "@/hooks/use-collections";
import { authClient } from "@/lib/auth-client";
import { sessionQueryOptions } from "@/lib/auth-session";
import { errorText } from "@/lib/error-text";

const RESET_CONFIRM_WORD = "reset";

/**
 * Both live outside the handlers below because React Compiler cannot lower a
 * conditional (ternary, `??`, `?.`) that sits inside a try/catch — moving the
 * branching into a plain function keeps the handler compilable.
 * @returns The message for a completed reset.
 */
function resetSummaryMessage(summary: {
  removedCopies: number;
  removedCollections: number;
}): string {
  const copies = summary.removedCopies === 1 ? "card" : "cards";
  const collections = summary.removedCollections === 1 ? "collection" : "collections";
  return `Collections reset: removed ${summary.removedCopies} ${copies} and ${summary.removedCollections} ${collections}.`;
}

function ResetCollectionsAction() {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resetCollections = useResetCollections();

  async function handleReset() {
    if (confirmText.trim().toLowerCase() !== RESET_CONFIRM_WORD) {
      setError(`Type "${RESET_CONFIRM_WORD}" to confirm.`);
      return;
    }
    setError(null);
    try {
      const summary = await resetCollections.mutateAsync();
      setOpen(false);
      toast.success(resetSummaryMessage(summary));
    } catch (resetError) {
      setError(errorText(resetError, "Failed to reset collections."));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Reset collections</p>
        <p className="text-muted-foreground text-sm">
          Removes every card and every collection except your Inbox, plus lists that end up empty.
          Group collections are untouched.
        </p>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setConfirmText("");
            setError(null);
          }
        }}
      >
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className="self-start">
              Reset collections
            </Button>
          }
        />
        <AlertDialogContent>
          <DialogForm onSubmit={handleReset}>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset your collections?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes every card you own, deletes all collections except your
                Inbox, and removes lists that become empty (lists with dynamic rules are kept). Your
                decks and account stay. This cannot be undone. Type &quot;
                {RESET_CONFIRM_WORD}&quot; to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Input
                autoComplete="off"
                placeholder={`Type "${RESET_CONFIRM_WORD}" to confirm`}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                aria-invalid={Boolean(error)}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={resetCollections.isPending}>
                {resetCollections.isPending ? "Resetting..." : "Reset collections"}
              </Button>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteAccountAction() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  async function handleDelete() {
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: deleteError } = await authClient.deleteUser({ password });
    setLoading(false);
    if (deleteError) {
      setError(deleteError.message ?? "Failed to delete account.");
      return;
    }
    // Navigate first so the profile page (and any other authenticated
    // subtree) starts unmounting, then refetch the session — the deleted
    // user's cookie is gone, the server returns null. Synchronously
    // flipping the session would re-render hooks under the still-mounted
    // authenticated routes with no userId — useRequiredUserId throws.
    // The refetch is async; its network round-trip gives React time to
    // commit the unmount before observers see the new state.
    await router.navigate({ to: "/" });
    void queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Delete account</p>
        <p className="text-muted-foreground text-sm">
          Permanently deletes your account and everything in it.
        </p>
      </div>
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className="self-start">
              Delete account
            </Button>
          }
        />
        <AlertDialogContent>
          <DialogForm onSubmit={handleDelete}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all your data. Enter your password to
                confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? "Deleting..." : "Delete account"}
              </Button>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function DangerZoneSection() {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Danger Zone</CardTitle>
        <CardDescription>These actions cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ResetCollectionsAction />
        <DeleteAccountAction />
      </CardContent>
    </Card>
  );
}
