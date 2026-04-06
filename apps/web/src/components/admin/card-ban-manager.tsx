import { BanIcon, CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCardBans,
  useCreateCardBan,
  useRemoveCardBan,
  useUpdateCardBan,
} from "@/hooks/use-card-bans";
import { useFormats } from "@/hooks/use-formats";

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
  const { data: formats } = useFormats();
  const createBan = useCreateCardBan();
  const updateBan = useUpdateCardBan();
  const removeBan = useRemoveCardBan();

  const [formatId, setFormatId] = useState("");
  const [bannedAt, setBannedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const [editingBanId, setEditingBanId] = useState<string | null>(null);
  const [editBannedAt, setEditBannedAt] = useState("");
  const [editReason, setEditReason] = useState("");

  // Default to first format once loaded
  const effectiveFormatId = formatId || formats?.[0]?.id || "";

  const hasBans = !isLoading && bans && bans.length > 0;

  function handleCreate() {
    if (!effectiveFormatId) {
      return;
    }
    createBan.mutate(
      { cardId, formatId: effectiveFormatId, bannedAt, reason: reason.trim() || null },
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

  const formatNameById = new Map(formats?.map((f) => [f.id, f.name]));

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <BanIcon className="text-muted-foreground size-4" />
        <h3 className="font-medium">Bans</h3>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : hasBans ? (
        <div className="space-y-1.5">
          {bans.map((ban) =>
            editingBanId === ban.id ? (
              <div
                key={ban.id}
                className="flex flex-wrap items-end gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5"
              >
                <Badge variant="destructive" className="self-center">
                  {ban.formatName}
                </Badge>
                <div className="space-y-1">
                  <Label>Banned at</Label>
                  <DatePicker
                    value={editBannedAt || null}
                    onChange={setEditBannedAt}
                    className="w-44"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Label>Reason (optional)</Label>
                  <Input
                    value={editReason}
                    onChange={(event) => setEditReason(event.target.value)}
                    placeholder="e.g. Enables degenerate combo…"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    updateBan.mutate(
                      {
                        cardId,
                        formatId: ban.formatId,
                        bannedAt: editBannedAt,
                        reason: editReason.trim() || null,
                      },
                      { onSuccess: () => setEditingBanId(null) },
                    );
                  }}
                  disabled={updateBan.isPending}
                >
                  <CheckIcon />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEditingBanId(null)}>
                  <XIcon />
                </Button>
              </div>
            ) : (
              <div
                key={ban.id}
                className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-1.5"
              >
                <Badge variant="destructive">{ban.formatName}</Badge>
                <span className="text-muted-foreground">since {ban.bannedAt}</span>
                {ban.reason && <span className="text-muted-foreground italic">{ban.reason}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={() => {
                    setEditingBanId(ban.id);
                    setEditBannedAt(ban.bannedAt);
                    setEditReason(ban.reason ?? "");
                  }}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeBan.mutate({ cardId, formatId: ban.formatId })}
                  disabled={removeBan.isPending}
                >
                  <XIcon />
                </Button>
              </div>
            ),
          )}
        </div>
      ) : null}

      {showForm ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
          <div className="space-y-1">
            <Label>Format</Label>
            <Select
              value={effectiveFormatId}
              onValueChange={(value) => value && setFormatId(value)}
            >
              <SelectTrigger className="w-32">
                <SelectValue>{(value: string) => formatNameById.get(value) ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {formats?.map((format) => (
                  <SelectItem key={format.id} value={format.id}>
                    {format.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Banned at</Label>
            <DatePicker value={bannedAt || null} onChange={setBannedAt} className="w-44" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label>Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Enables degenerate combo…"
            />
          </div>
          <Button onClick={handleCreate} disabled={createBan.isPending || !effectiveFormatId}>
            Ban
          </Button>
          <Button variant="ghost" onClick={() => onShowFormChange?.(false)}>
            Cancel
          </Button>
        </div>
      ) : hasBans ? (
        <Button variant="outline" onClick={() => onShowFormChange?.(true)}>
          <PlusIcon className="mr-1" />
          Add ban
        </Button>
      ) : null}
    </section>
  );
}
