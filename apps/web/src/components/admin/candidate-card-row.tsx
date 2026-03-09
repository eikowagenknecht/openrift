import type { CandidateCard } from "@openrift/shared";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function CandidateCardRow({
  candidate,
  isSelected,
  onToggleSelect,
  onAccept,
  onReject,
  onEdit: _onEdit,
  acceptPending,
  rejectPending,
}: {
  candidate: CandidateCard;
  isSelected: boolean;
  onToggleSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
  onEdit: (fields: Record<string, unknown>) => void;
  acceptPending: boolean;
  rejectPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstPrinting = candidate.printings[0];

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="size-4 rounded border-border"
          />

          {firstPrinting?.imageUrl && (
            <img
              src={firstPrinting.imageUrl}
              alt={candidate.name}
              className="h-16 w-auto rounded object-contain"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{candidate.name}</span>
              <Badge variant="outline" className="text-xs">
                {candidate.type}
              </Badge>
              {candidate.domains.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {candidate.domains.join(", ")}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{candidate.sourceId}</span>
              <span>&middot;</span>
              <span>
                {candidate.printings.length} printing
                {candidate.printings.length === 1 ? "" : "s"}
              </span>
              {candidate.source && (
                <>
                  <span>&middot;</span>
                  <span>{candidate.source}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setExpanded(!expanded)}>
              {expanded ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-green-600 hover:text-green-700 dark:text-green-400"
              disabled={acceptPending}
              onClick={onAccept}
            >
              <CheckIcon className="size-4" />
              Accept
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

      {expanded && (
        <CardContent className="border-t pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 text-sm">
              <h4 className="font-medium">Card Fields</h4>
              <Field label="Source ID" value={candidate.sourceId} />
              <Field label="Type" value={candidate.type} />
              <Field label="Super Types" value={candidate.superTypes.join(", ") || "—"} />
              <Field label="Domains" value={candidate.domains.join(", ")} />
              <Field label="Might" value={candidate.might?.toString() ?? "—"} />
              <Field label="Energy" value={candidate.energy?.toString() ?? "—"} />
              <Field label="Power" value={candidate.power?.toString() ?? "—"} />
              <Field label="Might Bonus" value={candidate.mightBonus?.toString() ?? "—"} />
              <Field label="Keywords" value={candidate.keywords.join(", ") || "—"} />
              <Field label="Tags" value={candidate.tags.join(", ") || "—"} />
              <Field label="Rules Text" value={candidate.rulesText || "—"} />
              <Field label="Effect Text" value={candidate.effectText || "—"} />
            </div>

            <div className="space-y-3 text-sm">
              <h4 className="font-medium">Printings</h4>
              {candidate.printings.map((p) => (
                <div key={p.id} className="space-y-1 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{p.sourceId}</span>
                    <Badge variant="outline" className="text-xs">
                      {p.rarity}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {p.finish}
                    </Badge>
                  </div>
                  <Field label="Set" value={`${p.setId}${p.setName ? ` (${p.setName})` : ""}`} />
                  <Field label="Collector #" value={String(p.collectorNumber)} />
                  <Field label="Art Variant" value={p.artVariant || "—"} />
                  <Field label="Artist" value={p.artist} />
                  <Field label="Signed" value={p.isSigned ? "Yes" : "No"} />
                  <Field label="Promo" value={p.isPromo ? "Yes" : "No"} />
                  {p.imageUrl && (
                    <div>
                      <span className="text-muted-foreground">Image: </span>
                      <a
                        href={p.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-xs text-blue-600 underline dark:text-blue-400"
                      >
                        {p.imageUrl}
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="break-words">{value}</span>
    </div>
  );
}
