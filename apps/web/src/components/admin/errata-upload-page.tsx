import type { UploadErrataResponse } from "@openrift/shared/contracts/admin/card-mutations";
import {
  CheckIcon,
  ChevronRightIcon,
  EyeIcon,
  FileWarningIcon,
  LoaderIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Code } from "@/components/ui/code";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BulkErrataEntry } from "@/hooks/use-card-errata";
import { useUploadErrata } from "@/hooks/use-card-errata";

type ParseResult =
  | { ok: true; entries: BulkErrataEntry[] }
  | { ok: false; error: "invalid-json" | "empty-or-wrong-shape" };

/**
 * Parses a bulk-errata JSON file. Accepts either a bare array or `{ entries: [...] }`.
 *
 * Kept as a module-level helper so react-compiler doesn't try to lower the ternary + logical
 * expressions inside the try/catch (it bails on "value blocks" within try statements).
 * @param text Raw file contents.
 * @returns Parsed entries on success; otherwise a tagged error indicating which failure occurred.
 */
function parseErrataEntries(text: string): ParseResult {
  try {
    const json = JSON.parse(text) as unknown[] | { entries?: unknown };
    const list = Array.isArray(json) ? json : json.entries;
    if (!Array.isArray(list) || list.length === 0) {
      return { ok: false, error: "empty-or-wrong-shape" };
    }
    return { ok: true, entries: list as BulkErrataEntry[] };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}

export function ErrataUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [entries, setEntries] = useState<BulkErrataEntry[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadErrataResponse | null>(null);

  const upload = useUploadErrata();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setEntries(null);
    setPreview(null);
    upload.reset();

    let text: string;
    try {
      text = await file.text();
    } catch {
      setParseError("Could not read that file");
      return;
    }
    const parsed = parseErrataEntries(text);
    if (!parsed.ok) {
      setParseError(
        parsed.error === "invalid-json"
          ? "Invalid JSON file"
          : "JSON must contain a non-empty array of errata entries",
      );
      return;
    }
    setEntries(parsed.entries);
  }

  function handlePreview() {
    if (!entries) {
      return;
    }
    upload.mutate(
      { dryRun: true, entries },
      {
        onSuccess: (data) => {
          setPreview(data);
        },
      },
    );
  }

  function handleApply() {
    if (!entries) {
      return;
    }
    upload.mutate(
      { dryRun: false, entries },
      {
        onSuccess: () => {
          setEntries(null);
          setFileName(null);
          setPreview(null);
          if (fileRef.current) {
            fileRef.current.value = "";
          }
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageTopBar title="Errata" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarningIcon className="size-5 shrink-0" />
            Upload Errata
          </CardTitle>
          <CardDescription>
            Each entry replaces the corrected text for one card, keyed by slug.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormatHelp />

          <div className="space-y-2">
            <Label htmlFor="errata-file">JSON file</Label>
            <Input
              id="errata-file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(event) => void handleFileChange(event)}
            />
            {fileName && entries && (
              <p className="text-muted-foreground text-sm">
                {fileName} ({entries.length} entr{entries.length === 1 ? "y" : "ies"})
              </p>
            )}
            {parseError && (
              <p className="text-destructive flex items-center gap-1 text-sm">
                <XIcon className="size-4" />
                {parseError}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button disabled={!entries || upload.isPending} onClick={handlePreview}>
              {upload.isPending && preview === null ? (
                <>
                  <LoaderIcon className="size-4 animate-spin" />
                  Previewing...
                </>
              ) : (
                <>
                  <EyeIcon className="size-4" />
                  Preview
                </>
              )}
            </Button>
            <Button
              variant="default"
              disabled={!entries || !preview || upload.isPending}
              onClick={handleApply}
            >
              {upload.isPending && preview !== null ? (
                <>
                  <LoaderIcon className="size-4 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <UploadIcon className="size-4" />
                  Apply
                </>
              )}
            </Button>
          </div>

          {preview && <PreviewSummary data={preview} />}

          {upload.isSuccess && !preview && (
            <p className="text-success flex items-center gap-1 text-sm">
              <CheckIcon className="size-4" />
              Errata applied successfully
            </p>
          )}

          {upload.isError && (
            <p className="text-destructive flex items-center gap-1 text-sm">
              <XIcon className="size-4" />
              {upload.error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const EXAMPLE_ERRATA_JSON = `[
  {
    "cardSlug": "jinx-rebel",
    "correctedRulesText": "When this unit attacks, deal 2 damage to target unit.",
    "correctedEffectText": null,
    "source": "Official rulings, 2026-03-15",
    "sourceUrl": "https://example.com/rulings",
    "effectiveDate": "2026-03-15"
  }
]`;

function FormatHelp() {
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger className="group text-muted-foreground hover:text-foreground flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium select-none">
        Format and example
        <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 border-t px-3 py-3 text-sm">
        <p>
          The file must contain a JSON array of entries (or an object with an <Code>entries</Code>{" "}
          field holding the array). Each entry has these fields:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <Code>cardSlug</Code> (string, required): slug of the card to errata.
          </li>
          <li>
            <Code>correctedRulesText</Code> (string or <Code>null</Code>): corrected rules text. At
            least one of rules or effect text must be set.
          </li>
          <li>
            <Code>correctedEffectText</Code> (string or <Code>null</Code>): corrected effect text.
          </li>
          <li>
            <Code>source</Code> (string, required): short label describing where the correction
            comes from.
          </li>
          <li>
            <Code>sourceUrl</Code> (string or <Code>null</Code>, optional): link to the source.
          </li>
          <li>
            <Code>effectiveDate</Code> (string <Code>YYYY-MM-DD</Code> or <Code>null</Code>,
            optional): date the errata took effect.
          </li>
        </ul>
        <p>Example:</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3">
          <code>{EXAMPLE_ERRATA_JSON}</code>
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewSummary({ data }: { data: UploadErrataResponse }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Pill label="New" count={data.newCount} tone="success" />
        <Pill label="Updated" count={data.updatedCount} tone="warning" />
        <Pill label="Unchanged" count={data.unchangedCount} tone="muted" />
        <Pill label="Matches printed" count={data.matchesPrintedCount} tone="muted" />
        <Pill label="Errors" count={data.errors.length} tone="destructive" />
      </div>

      {data.errors.length > 0 && (
        <ul className="text-destructive ml-5 list-disc text-sm">
          {data.errors.slice(0, 10).map((err, index) => (
            <li key={index}>{err}</li>
          ))}
          {data.errors.length > 10 && <li>...and {data.errors.length - 10} more</li>}
        </ul>
      )}

      {data.newEntries.length > 0 && (
        <EntryList label={`New errata (${data.newEntries.length})`} entries={data.newEntries} />
      )}

      {data.updatedEntries.length > 0 && (
        <DiffList
          label={`Updated errata (${data.updatedEntries.length})`}
          entries={data.updatedEntries}
        />
      )}

      {data.skippedMatchesPrinted.length > 0 && (
        <EntryList
          label={`Skipped — already matches printed text (${data.skippedMatchesPrinted.length})`}
          entries={data.skippedMatchesPrinted}
        />
      )}
    </div>
  );
}

function Pill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  return (
    <Badge variant={tone} className="h-auto rounded-md px-2 py-0.5 text-sm">
      {label}: {count}
    </Badge>
  );
}

function EntryList({
  label,
  entries,
}: {
  label: string;
  entries: { cardSlug: string; cardName: string }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm font-medium">{label}:</p>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Slug</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.map((entry) => (
              <tr key={entry.cardSlug}>
                <td className="px-2 py-1 font-medium">{entry.cardName}</td>
                <td className="text-muted-foreground px-2 py-1">{entry.cardSlug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffList({
  label,
  entries,
}: {
  label: string;
  entries: {
    cardSlug: string;
    cardName: string;
    fields: { field: string; from: string | null; to: string | null }[];
  }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm font-medium">{label}:</p>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Card</th>
              <th className="px-2 py-1">Field</th>
              <th className="px-2 py-1">From</th>
              <th className="px-2 py-1">To</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.flatMap((entry) =>
              entry.fields.map((field, fieldIndex) => (
                <tr key={`${entry.cardSlug}-${fieldIndex}`}>
                  <td className="px-2 py-1 font-medium">{entry.cardName}</td>
                  <td className="px-2 py-1">{field.field}</td>
                  <td
                    className="text-destructive max-w-48 truncate px-2 py-1"
                    title={JSON.stringify(field.from)}
                  >
                    {JSON.stringify(field.from)}
                  </td>
                  <td
                    className="text-success max-w-48 truncate px-2 py-1"
                    title={JSON.stringify(field.to)}
                  >
                    {JSON.stringify(field.to)}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
