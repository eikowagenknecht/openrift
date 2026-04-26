import { CheckIcon, EyeIcon, FileWarningIcon, LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BulkErrataEntry, BulkErrataUploadResponse } from "@/hooks/use-card-errata";
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
    const json = JSON.parse(text);
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
  const [preview, setPreview] = useState<BulkErrataUploadResponse | null>(null);

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

    const text = await file.text();
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileWarningIcon className="size-5 shrink-0" />
            Upload Errata
          </CardTitle>
          <CardDescription>
            Upload a JSON file with bulk card errata. Each entry replaces the corrected text for one
            card keyed by slug. Preview to see the classification before applying.
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
              onChange={handleFileChange}
            />
            {fileName && entries && (
              <p className="text-muted-foreground text-sm">
                {fileName} ({entries.length} entr{entries.length === 1 ? "y" : "ies"})
              </p>
            )}
            {parseError && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
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
            <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <CheckIcon className="size-4" />
              Errata applied successfully
            </p>
          )}

          {upload.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
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
    <details className="rounded-md border">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-3 py-2 text-sm font-medium select-none">
        Format and example
      </summary>
      <div className="space-y-3 border-t px-3 py-3 text-sm">
        <p>
          The file must contain a JSON array of entries (or an object with an{" "}
          <code className="bg-muted rounded px-1">entries</code> field holding the array). Each
          entry has these fields:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code className="bg-muted rounded px-1">cardSlug</code> (string, required): slug of the
            card to errata.
          </li>
          <li>
            <code className="bg-muted rounded px-1">correctedRulesText</code> (string or{" "}
            <code className="bg-muted rounded px-1">null</code>): corrected rules text. At least one
            of rules or effect text must be set.
          </li>
          <li>
            <code className="bg-muted rounded px-1">correctedEffectText</code> (string or{" "}
            <code className="bg-muted rounded px-1">null</code>): corrected effect text.
          </li>
          <li>
            <code className="bg-muted rounded px-1">source</code> (string, required): short label
            describing where the correction comes from.
          </li>
          <li>
            <code className="bg-muted rounded px-1">sourceUrl</code> (string or{" "}
            <code className="bg-muted rounded px-1">null</code>, optional): link to the source.
          </li>
          <li>
            <code className="bg-muted rounded px-1">effectiveDate</code> (string{" "}
            <code className="bg-muted rounded px-1">YYYY-MM-DD</code> or{" "}
            <code className="bg-muted rounded px-1">null</code>, optional): date the errata took
            effect.
          </li>
        </ul>
        <p>Example:</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3">
          <code>{EXAMPLE_ERRATA_JSON}</code>
        </pre>
      </div>
    </details>
  );
}

function PreviewSummary({ data }: { data: BulkErrataUploadResponse }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <Pill label="New" count={data.newCount} tone="green" />
        <Pill label="Updated" count={data.updatedCount} tone="amber" />
        <Pill label="Unchanged" count={data.unchangedCount} tone="muted" />
        <Pill label="Matches printed" count={data.matchesPrintedCount} tone="muted" />
        <Pill label="Errors" count={data.errors.length} tone="red" />
      </div>

      {data.errors.length > 0 && (
        <ul className="ml-5 list-disc text-sm text-red-600 dark:text-red-400">
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
  tone: "green" | "amber" | "red" | "muted";
}) {
  const toneClass = {
    green: "bg-green-500/10 text-green-700 dark:text-green-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    red: "bg-red-500/10 text-red-700 dark:text-red-300",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <span className={`rounded-md px-2 py-0.5 font-medium ${toneClass}`}>
      {label}: {count}
    </span>
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
                    className="max-w-48 truncate px-2 py-1 text-red-600 dark:text-red-400"
                    title={JSON.stringify(field.from)}
                  >
                    {JSON.stringify(field.from)}
                  </td>
                  <td
                    className="max-w-48 truncate px-2 py-1 text-green-600 dark:text-green-400"
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
