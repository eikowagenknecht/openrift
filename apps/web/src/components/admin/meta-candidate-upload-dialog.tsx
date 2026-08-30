import type { MetaUploadBody, MetaUploadResponse } from "@openrift/shared";
import { UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { CandidateDisclosure } from "@/components/admin/meta-candidate-shared";
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
import type { StatStripItem } from "@/components/ui/stat-strip";
import { StatStrip } from "@/components/ui/stat-strip";
import { useUploadMetaCandidates } from "@/hooks/use-admin-meta-candidates";
import { parseMetaUploadFile } from "@/lib/meta-candidate-review";

const EXAMPLE_UPLOAD_JSON = `{
  "provider": "riftdecks",
  "events": [
    {
      "externalId": "summoner-skirmish-2026-08",
      "name": "Summoner Skirmish",
      "eventDate": "2026-08-02",
      "format": "standard",
      "playerCount": 64,
      "organizer": "Piltover Game Night",
      "sourceUrl": "https://example.test/events/1",
      "players": [
        {
          "externalId": "summoner-skirmish-2026-08-1",
          "playerName": "Rin",
          "rank": 1,
          "rankIsTier": false,
          "wins": 6,
          "losses": 1,
          "draws": 0,
          "legendName": "Yasuo",
          "cards": [{ "name": "Yasuo", "zone": "legend", "quantity": 1 }]
        },
        {
          "externalId": "summoner-skirmish-2026-08-2",
          "playerName": "Kael",
          "rank": 8,
          "rankIsTier": true,
          "wins": 4,
          "losses": 3,
          "draws": 0,
          "legendName": "Lux"
        }
      ]
    }
  ]
}`;

function FormatHelp() {
  return (
    <CandidateDisclosure title="Format and example" contentClassName="space-y-3 py-3">
      <p>
        The file is the whole request body: a{" "}
        <code className="bg-muted rounded px-1">provider</code> string and a non-empty{" "}
        <code className="bg-muted rounded px-1">events</code> array. Each event replaces its own
        staged copy in full, keyed by <code className="bg-muted rounded px-1">externalId</code>;
        events left out of the file are untouched. A player carries a list only when the source
        published one; the rest are standings rows with a legend. Card and legend names are matched
        against the catalog on ingest.
      </p>
      <pre className="bg-muted overflow-x-auto rounded-md p-3">
        <code>{EXAMPLE_UPLOAD_JSON}</code>
      </pre>
    </CandidateDisclosure>
  );
}

/**
 * What the ingest did, as the shared compact counts row.
 *
 * @param result - The upload response.
 * @returns The strip's items, event counts first.
 */
function summaryItems(result: MetaUploadResponse): StatStripItem[] {
  return [
    { key: "new-events", value: result.newEvents, label: "new events" },
    { key: "updated-events", value: result.updatedEvents, label: "updated events" },
    { key: "unchanged-events", value: result.unchangedEvents, label: "unchanged events" },
    { key: "ignored-skipped", value: result.ignoredSkipped, label: "skipped (ignored)" },
    { key: "new-players", value: result.newPlayers, label: "new players" },
    { key: "updated-players", value: result.updatedPlayers, label: "updated players" },
    { key: "removed-players", value: result.removedPlayers, label: "removed players" },
    { key: "unchanged-players", value: result.unchangedPlayers, label: "unchanged players" },
  ];
}

function UploadSummary({ result }: { result: MetaUploadResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Staged under <span className="font-mono">{result.provider}</span>.
      </p>
      <StatStrip items={summaryItems(result)} />

      {result.newEventDetails.length > 0 && (
        <CandidateDisclosure title={`New events (${result.newEventDetails.length})`}>
          <ul className="space-y-1">
            {result.newEventDetails.map((event) => (
              <li key={event.externalId}>
                {event.name}{" "}
                <span className="text-muted-foreground font-mono">{event.externalId}</span>
              </li>
            ))}
          </ul>
        </CandidateDisclosure>
      )}

      {result.updatedEventDetails.length > 0 && (
        <CandidateDisclosure title={`Updated events (${result.updatedEventDetails.length})`}>
          <ul className="space-y-1">
            {result.updatedEventDetails.map((event) => (
              <li key={event.externalId}>
                {event.name}{" "}
                <span className="text-muted-foreground font-mono">{event.externalId}</span>
              </li>
            ))}
          </ul>
        </CandidateDisclosure>
      )}

      {result.removedPlayerDetails.length > 0 && (
        <CandidateDisclosure
          title={`Players the source dropped (${result.removedPlayerDetails.length})`}
        >
          <ul className="space-y-1">
            {result.removedPlayerDetails.map((player) => (
              <li key={`${player.eventExternalId}-${player.externalId}`}>
                {player.playerName}{" "}
                <span className="text-muted-foreground font-mono">
                  {player.eventExternalId} / {player.externalId}
                </span>
              </li>
            ))}
          </ul>
        </CandidateDisclosure>
      )}

      {result.unresolvedCards.length > 0 && (
        <CandidateDisclosure
          title={`Lists with unmatched card names (${result.unresolvedCards.length})`}
        >
          <ul className="space-y-2">
            {result.unresolvedCards.map((entry) => (
              <li key={`${entry.eventExternalId}-${entry.playerExternalId}`}>
                <span className="text-muted-foreground font-mono">
                  {entry.eventExternalId} / {entry.playerExternalId}
                </span>
                <div>{entry.names.join(", ")}</div>
              </li>
            ))}
          </ul>
        </CandidateDisclosure>
      )}

      {result.errors.length > 0 && (
        <CandidateDisclosure title={`Errors (${result.errors.length})`}>
          <ul className="text-destructive space-y-1">
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CandidateDisclosure>
      )}
    </div>
  );
}

/**
 * The candidate upload flow (ADR-014): pick a `{ provider, events }` JSON file
 * and stage it. The same payload the maintainer's tooling pushes with an API
 * key, so the dialog validates only the envelope; per-event validation happens
 * server-side and comes back in the summary's error list.
 *
 * @returns The upload dialog.
 */
export function MetaCandidateUploadDialog({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadMetaCandidates();
  const [fileName, setFileName] = useState<string | null>(null);
  const [body, setBody] = useState<MetaUploadBody | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<MetaUploadResponse | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setFileName(file.name);
    setParseError(null);
    setBody(null);
    setResult(null);

    const text = await file.text();
    const parsed = parseMetaUploadFile(text);
    if (!parsed.ok) {
      setParseError(parsed.error);
      return;
    }
    setBody(parsed.body);
  }

  async function handleUpload() {
    if (!body) {
      return;
    }
    let response: MetaUploadResponse;
    try {
      response = await upload.mutateAsync(body);
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    setResult(response);
    setBody(null);
    setFileName(null);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload candidates</DialogTitle>
          <DialogDescription>
            Nothing reaches the archive until you accept it in the queue.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          <FormatHelp />

          <div className="space-y-2">
            <Label htmlFor="meta-candidates-file">JSON file</Label>
            <Input
              id="meta-candidates-file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
            {fileName && body && (
              <p className="text-muted-foreground text-sm">
                {fileName}: {body.events.length} event{body.events.length === 1 ? "" : "s"} under{" "}
                <span className="font-mono">{body.provider}</span>
              </p>
            )}
            {parseError && (
              <p className="text-destructive flex items-center gap-1 text-sm">
                <XIcon className="size-4" />
                {parseError}
              </p>
            )}
          </div>

          {result && <UploadSummary result={result} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={handleUpload} disabled={!body || upload.isPending}>
            <UploadIcon />
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
