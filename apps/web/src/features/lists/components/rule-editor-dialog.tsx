import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import type { ListRule, ListRuleCombine } from "@openrift/shared/types/list-rule";
import { useQueryClient } from "@tanstack/react-query";
import { Suspense, useLayoutEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogQueryOptions } from "@/features/cards/hooks/catalog-query";
import { pricesQueryOptions } from "@/features/cards/hooks/use-prices";
import { loadCatalogTail } from "@/features/cards/lib/catalog-query";
import { CardRuleEditor, CopyRuleEditor } from "@/features/lists/components/rule-editors";
import { useUpdateList } from "@/features/lists/hooks/use-lists";
import { ruleWording } from "@/features/rules/lib/rule-wording";
import { useRuleEditorStore } from "@/features/rules/stores/rule-editor-store";
import { initQueryOptions } from "@/hooks/use-init";

interface RuleEditorDialogProps {
  listId: string;
  intent: ListIntent;
  kind: ListKind;
  currentRules: ListRule[];
  currentRuleCombine: ListRuleCombine | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RuleEditorDialog({
  listId,
  intent,
  kind,
  currentRules,
  currentRuleCombine,
  open,
  onOpenChange,
}: RuleEditorDialogProps) {
  const updateList = useUpdateList();
  const queryClient = useQueryClient();

  const load = useRuleEditorStore((state) => state.load);
  const reset = useRuleEditorStore((state) => state.reset);
  const buildRules = useRuleEditorStore((state) => state.buildRules);

  // Prewarms queries so a rule block's useSuspenseQuery doesn't suspend cold
  // and collapse the pending boundary, resetting `open` and closing the dialog.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    load(currentRules, currentRuleCombine);
    void (async () => {
      await queryClient.query({ ...catalogQueryOptions, staleTime: "static" });
      await loadCatalogTail(queryClient);
    })();
    void queryClient.query({ ...initQueryOptions, staleTime: "static" });
    void queryClient.query({ ...pricesQueryOptions, staleTime: "static" });
    return () => reset();
  }, [open, currentRules, currentRuleCombine, load, reset, queryClient]);

  const wording = ruleWording(intent, kind);

  const handleSave = () => {
    if (updateList.isPending) {
      return;
    }
    const next = buildRules(kind);
    const ruleCombine = useRuleEditorStore.getState().ruleCombine;
    updateList.mutate(
      { listId, rules: next, ruleCombine },
      {
        onSuccess: () => {
          toast.success(next.length > 0 ? "Rules saved" : "Rules removed");
          onOpenChange(false);
        },
        // No onError: a per-call handler runs in ADDITION to the global
        // mutation onError, which already toasts the server's message.
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogForm onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Dynamic rules</DialogTitle>
            <DialogDescription>{wording.description}</DialogDescription>
          </DialogHeader>

          <Suspense fallback={<Skeleton className="h-24 w-full rounded-lg" />}>
            {wording.isCopy ? (
              <CopyRuleEditor intent={intent} kind={kind} wording={wording} />
            ) : (
              <CardRuleEditor intent={intent} kind={kind} wording={wording} />
            )}
          </Suspense>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={updateList.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateList.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
