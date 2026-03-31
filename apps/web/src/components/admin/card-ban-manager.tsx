import type { DeckFormat } from "@openrift/shared";
import { BanIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCardBans, useCreateCardBan, useRemoveCardBan } from "@/hooks/use-card-bans";

const FORMAT_LABELS: Record<DeckFormat, string> = {
  standard: "Standard",
  freeform: "Freeform",
};

interface CardBanManagerProps {
  cardId: string;
  showForm?: boolean;
  onShowFormChange?: (show: boolean) => void;
}

/**
 * Inline admin panel for managing card bans (add/remove).
 * Hidden when there are no bans and the form is closed.
 * @returns The ban management section, or null if nothing to show.
 */
export function CardBanManager({ cardId, showForm, onShowFormChange }: CardBanManagerProps) {
  const { data: bans, isLoading } = useCardBans(cardId);
  const createBan = useCreateCardBan();
  const removeBan = useRemoveCardBan();

  const [formatId, setFormatId] = useState<DeckFormat>("standard");
  const [bannedAt, setBannedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const hasBans = !isLoading && bans && bans.length > 0;

  function handleCreate() {
    createBan.mutate(
      { cardId, formatId, bannedAt, reason: reason.trim() || null },
      {
        onSuccess: () => {
          onShowFormChange?.(false);
          setReason("");
        },
      },
    );
  }

  // Hide entirely when there are no bans and the form is closed
  if (!hasBans && !showForm && !isLoading) {
    return null;
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <BanIcon className="text-muted-foreground size-4" />
        <h3 className="font-medium">Bans</h3>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : hasBans ? (
        <div className="space-y-1.5">
          {bans.map((ban) => (
            <div
              key={ban.id}
              className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5"
            >
              <Badge variant="destructive" className="text-xs">
                {FORMAT_LABELS[ban.formatId as DeckFormat] ?? ban.formatId}
              </Badge>
              <span className="text-muted-foreground text-xs">since {ban.bannedAt}</span>
              {ban.reason && (
                <span className="text-muted-foreground truncate text-xs italic">{ban.reason}</span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto size-5"
                onClick={() => removeBan.mutate({ cardId, formatId: ban.formatId })}
                disabled={removeBan.isPending}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {showForm ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Format</Label>
            <Select value={formatId} onValueChange={(value) => setFormatId(value as DeckFormat)}>
              <SelectTrigger size="sm" className="w-32 text-xs">
                <SelectValue>
                  {(value: string) => FORMAT_LABELS[value as DeckFormat] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="freeform">Freeform</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Banned at</Label>
            <Input
              type="date"
              value={bannedAt}
              onChange={(e) => setBannedAt(e.target.value)}
              className="h-7 w-36 text-xs"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enables degenerate combo…"
              className="h-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleCreate}
            disabled={createBan.isPending}
          >
            Ban
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onShowFormChange?.(false)}
          >
            Cancel
          </Button>
        </div>
      ) : hasBans ? (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={() => onShowFormChange?.(true)}
        >
          <PlusIcon className="mr-1 size-3" />
          Add ban
        </Button>
      ) : null}
    </section>
  );
}
