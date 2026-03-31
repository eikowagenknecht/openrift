import { BanIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCardBans, useCreateCardBan, useRemoveCardBan } from "@/hooks/use-card-bans";

interface CardBanManagerProps {
  cardId: string;
}

/**
 * Inline admin panel for managing card bans (add/remove).
 * @returns The ban management section.
 */
export function CardBanManager({ cardId }: CardBanManagerProps) {
  const { data: bans, isLoading } = useCardBans(cardId);
  const createBan = useCreateCardBan();
  const removeBan = useRemoveCardBan();

  const [showForm, setShowForm] = useState(false);
  const [formatId, setFormatId] = useState("standard");
  const [bannedAt, setBannedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  function handleCreate() {
    createBan.mutate(
      { cardId, formatId, bannedAt, reason: reason.trim() || null },
      {
        onSuccess: () => {
          setShowForm(false);
          setReason("");
        },
      },
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <BanIcon className="text-muted-foreground size-4" />
        <h3 className="font-medium">Bans</h3>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : bans && bans.length > 0 ? (
        <div className="space-y-1.5">
          {bans.map((ban) => (
            <div
              key={ban.id}
              className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5"
            >
              <Badge variant="destructive" className="text-xs">
                {ban.formatId}
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
      ) : (
        <p className="text-muted-foreground text-sm">No active bans.</p>
      )}

      {showForm ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Format</Label>
            <Input
              value={formatId}
              onChange={(e) => setFormatId(e.target.value)}
              className="h-7 w-32 text-xs"
            />
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
            onClick={() => setShowForm(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setShowForm(true)}
        >
          <PlusIcon className="mr-1 size-3" />
          Add ban
        </Button>
      )}
    </section>
  );
}
