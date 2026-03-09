import type { CandidateCard } from "@openrift/shared";
import { CheckIcon, LinkIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const DIFF_FIELDS = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "superTypes", label: "Super Types" },
  { key: "domains", label: "Domains" },
  { key: "might", label: "Might" },
  { key: "energy", label: "Energy" },
  { key: "power", label: "Power" },
  { key: "mightBonus", label: "Might Bonus" },
  { key: "keywords", label: "Keywords" },
  { key: "rulesText", label: "Rules Text" },
  { key: "effectText", label: "Effect Text" },
  { key: "tags", label: "Tags" },
] as const;

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }
  return String(value);
}

export function CandidateDiffRow({
  candidate,
  onAccept,
  onReject,
  onCreateAlias,
  acceptPending,
  rejectPending,
}: {
  candidate: CandidateCard;
  onAccept: (acceptedFields: string[]) => void;
  onReject: () => void;
  onCreateAlias: (cardId: string) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}) {
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
  const [showAliasInput, setShowAliasInput] = useState(false);
  const [aliasCardId, setAliasCardId] = useState("");

  function toggleField(field: string) {
    setAcceptedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{candidate.name}</span>
              {candidate.matchedCard && (
                <>
                  <span className="text-muted-foreground">&rarr;</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {candidate.matchedCard.name}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {candidate.matchedCard.id}
                  </Badge>
                </>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{candidate.sourceId}</span>
              {candidate.source && (
                <>
                  <span>&middot;</span>
                  <span>{candidate.source}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAliasInput(!showAliasInput)}
              title="Create name alias"
            >
              <LinkIcon className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-green-600 hover:text-green-700 dark:text-green-400"
              disabled={acceptPending || acceptedFields.size === 0}
              onClick={() => onAccept([...acceptedFields])}
            >
              <CheckIcon className="size-4" />
              Accept ({acceptedFields.size})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 dark:text-red-400"
              disabled={rejectPending}
              onClick={onReject}
            >
              <XIcon className="size-4" />
              Reject
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 border-t pt-3">
        {showAliasInput && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
            <Input
              placeholder="Target card ID (e.g. OGN-027)"
              value={aliasCardId}
              onChange={(e) => setAliasCardId(e.target.value)}
              className="h-8 max-w-xs text-sm"
            />
            <Button
              size="sm"
              disabled={!aliasCardId.trim()}
              onClick={() => {
                onCreateAlias(aliasCardId.trim());
                setShowAliasInput(false);
                setAliasCardId("");
              }}
            >
              Create Alias
            </Button>
          </div>
        )}

        <div className="text-sm">
          <div className="mb-2 grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 gap-y-1.5 text-xs font-medium text-muted-foreground">
            <span />
            <span>Candidate</span>
            <span>Existing</span>
            <span>Accept</span>
          </div>
          {DIFF_FIELDS.map((field) => {
            const candidateVal = candidate[field.key as keyof CandidateCard];
            const candidateStr = formatFieldValue(candidateVal);

            return (
              <div
                key={field.key}
                className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-4 gap-y-1 border-t py-1.5"
              >
                <span className="w-24 text-xs text-muted-foreground">{field.label}</span>
                <span className="break-words text-xs">{candidateStr}</span>
                <span className="break-words text-xs text-muted-foreground">
                  {/* Existing card values loaded via matchedCard — shows as placeholder for now */}
                  —
                </span>
                <Switch
                  checked={acceptedFields.has(field.key)}
                  onCheckedChange={() => toggleField(field.key)}
                />
              </div>
            );
          })}
        </div>

        {candidate.printings.length > 0 && (
          <div className="text-sm">
            <h4 className="mb-1.5 font-medium">New Printings</h4>
            {candidate.printings.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                {p.imageUrl && (
                  <img
                    src={p.imageUrl}
                    alt={p.sourceId}
                    className="h-10 w-auto rounded object-contain"
                  />
                )}
                <span className="font-mono">{p.sourceId}</span>
                <Badge variant="outline">{p.rarity}</Badge>
                <Badge variant="outline">{p.finish}</Badge>
                <span className="text-muted-foreground">
                  {p.setId}
                  {p.setName ? ` (${p.setName})` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
