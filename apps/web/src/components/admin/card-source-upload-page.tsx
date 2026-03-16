import type { SourceStatsResponse } from "@openrift/shared";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  LoaderIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useDeleteSource,
  useSourceNames,
  useSourceStats,
  useUploadCardSources,
} from "@/hooks/use-card-sources";
import { useFavoriteSources } from "@/hooks/use-favorite-sources";
import { client } from "@/lib/rpc-client";
import { cn } from "@/lib/utils";

export function CardSourceUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const upload = useUploadCardSources();
  const { data: sourceNames } = useSourceNames();
  const { data: sourceStats } = useSourceStats();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setFileData(null);

    if (!source) {
      setSource(file.name.replace(/\.json$/i, ""));
    }

    const text = await file.text();
    try {
      const json = JSON.parse(text);
      // Support both { candidates: [...] } and bare array
      const candidates = Array.isArray(json) ? json : json.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        setParseError("JSON must contain a non-empty array of candidates");
        return;
      }
      setFileData(candidates);
    } catch {
      setParseError("Invalid JSON file");
    }
  }

  function handleUpload() {
    if (!fileData || !source.trim()) {
      return;
    }
    upload.mutate(
      { source: source.trim(), candidates: fileData },
      {
        onSuccess: () => {
          setSource("");
          setFileData(null);
          setFileName(null);
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
            <UploadIcon className="size-5 shrink-0" />
            Upload Card Sources
          </CardTitle>
          <CardDescription>
            Upload a JSON file with card data from an external source. Each card will be staged for
            review and comparison against existing data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">JSON file</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
            {fileName && fileData && (
              <p className="text-sm text-muted-foreground">
                {fileName} &mdash; {fileData.length} card{fileData.length === 1 ? "" : "s"}
              </p>
            )}
            {parseError && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {parseError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Source name <span className="text-red-500">*</span>
            </Label>
            <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
              <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
                <span className={source ? "text-foreground" : "text-muted-foreground"}>
                  {source || "Select or type a source name..."}
                </span>
                <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
              </PopoverTrigger>
              <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
                <Command
                  filter={(value, search) => {
                    if (value.startsWith("__create__")) {
                      return 1;
                    }
                    return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                  }}
                >
                  <CommandInput
                    placeholder="Type or select a source..."
                    value={source}
                    onValueChange={setSource}
                    onFocus={(e) => e.target.select()}
                  />
                  <CommandList>
                    <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                      No existing sources found.
                    </CommandEmpty>
                    {(() => {
                      const PINNED_SOURCES = ["gallery"];
                      const allNames = sourceNames
                        ? [...new Set([...PINNED_SOURCES, ...sourceNames])]
                        : PINNED_SOURCES;
                      return (
                        allNames.length > 0 && (
                          <CommandGroup heading="Existing sources">
                            {allNames.map((name) => (
                              <CommandItem
                                key={name}
                                value={name}
                                data-checked={source === name || undefined}
                                onSelect={(val) => {
                                  setSource(val);
                                  setSourceOpen(false);
                                }}
                              >
                                {name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )
                      );
                    })()}
                    {source.trim() &&
                      !["gallery", ...(sourceNames ?? [])].some(
                        (n) => n.toLowerCase() === source.trim().toLowerCase(),
                      ) && (
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${source.trim()}`}
                            onSelect={() => {
                              setSource(source.trim());
                              setSourceOpen(false);
                            }}
                          >
                            Create &ldquo;{source.trim()}&rdquo;
                          </CommandItem>
                        </CommandGroup>
                      )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              A unique label identifying where this data came from.
            </p>
          </div>

          <Button disabled={!fileData || !source.trim() || upload.isPending} onClick={handleUpload}>
            {upload.isPending ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload"
            )}
          </Button>

          {upload.isSuccess && (
            <div className="space-y-2">
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                Done — {upload.data.newCards} new, {upload.data.updates} updated,{" "}
                {upload.data.unchanged} unchanged
                {upload.data.errors.length > 0 && `, ${upload.data.errors.length} errors`}
              </p>
              {upload.data.errors.length > 0 && (
                <ul className="ml-5 list-disc text-xs text-red-600 dark:text-red-400">
                  {upload.data.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {upload.data.errors.length > 10 && (
                    <li>...and {upload.data.errors.length - 10} more</li>
                  )}
                </ul>
              )}
              {upload.data.updatedCards.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Updated cards:</p>
                  <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left">
                          <th className="px-2 py-1">Card</th>
                          <th className="px-2 py-1">Source ID</th>
                          <th className="px-2 py-1">Field</th>
                          <th className="px-2 py-1">From</th>
                          <th className="px-2 py-1">To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {upload.data.updatedCards.flatMap((card) =>
                          card.fields.map((f) => (
                            <tr key={`${card.sourceId ?? card.name}-${f.field}`}>
                              <td className="px-2 py-1 font-medium">{card.name}</td>
                              <td className="px-2 py-1 text-muted-foreground">
                                {card.sourceId ?? "—"}
                              </td>
                              <td className="px-2 py-1">{f.field}</td>
                              <td
                                className="max-w-48 truncate px-2 py-1 text-red-600 dark:text-red-400"
                                title={JSON.stringify(f.from)}
                              >
                                {JSON.stringify(f.from)}
                              </td>
                              <td
                                className="max-w-48 truncate px-2 py-1 text-green-600 dark:text-green-400"
                                title={JSON.stringify(f.to)}
                              >
                                {JSON.stringify(f.to)}
                              </td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {upload.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {upload.error.message}
            </p>
          )}
        </CardContent>
      </Card>
      <ExportCardsCard />
      {sourceNames && sourceNames.length > 0 && (
        <ManageSourcesCard sourceNames={sourceNames} sourceStats={sourceStats} />
      )}
    </div>
  );
}

function ExportCardsCard() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await client.api.admin["card-sources"].export.$get();
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error ?? `Export failed: ${res.status}`,
        );
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cards-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DownloadIcon className="size-5 shrink-0" />
          Export Cards
        </CardTitle>
        <CardDescription>
          Download all active cards and printings as a JSON file in the same format used for
          uploads.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={exporting} onClick={handleExport}>
          {exporting ? (
            <>
              <LoaderIcon className="size-4 animate-spin" />
              Exporting...
            </>
          ) : (
            "Export All Cards"
          )}
        </Button>
        {error && (
          <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ManageSourcesCard({
  sourceNames,
  sourceStats,
}: {
  sourceNames: string[];
  sourceStats?: SourceStatsResponse[];
}) {
  const deleteSource = useDeleteSource();
  const { favorites, toggleFavorite } = useFavoriteSources();
  const [confirming, setConfirming] = useState<string | null>(null);
  const statsBySource = new Map(sourceStats?.map((s) => [s.source, s]));
  const sortedNames = [...sourceNames].sort((a, b) => {
    const aFav = favorites.has(a);
    const bFav = favorites.has(b);
    if (aFav !== bFav) {
      return aFav ? -1 : 1;
    }
    return a.localeCompare(b);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2Icon className="size-5 shrink-0" />
          Manage Sources
        </CardTitle>
        <CardDescription>
          Delete all card and printing source data for a given source.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedNames.map((name) => {
            const stats = statsBySource.get(name);
            const isFav = favorites.has(name);
            return (
              <div
                key={name}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-yellow-500"
                    onClick={() => toggleFavorite(name)}
                    title={isFav ? "Remove from favorites" : "Add to favorites"}
                  >
                    <StarIcon
                      className={cn("size-4", isFav && "fill-yellow-400 text-yellow-400")}
                    />
                  </button>
                  <span className="text-sm font-medium">{name}</span>
                </span>
                <span className="flex items-center gap-4">
                  {stats && (
                    <span className="text-sm text-muted-foreground">
                      {stats.cardCount} cards, {stats.printingCount} printings
                      {" · "}
                      {new Date(stats.lastUpdated).toISOString().replace("T", " ").slice(0, 19)}
                    </span>
                  )}
                  {confirming === name ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Delete all data?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleteSource.isPending}
                        onClick={() => {
                          deleteSource.mutate(name, {
                            onSuccess: () => setConfirming(null),
                          });
                        }}
                      >
                        {deleteSource.isPending ? (
                          <LoaderIcon className="size-4 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deleteSource.isPending}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(name)}>
                      <Trash2Icon className="size-4" />
                      Delete
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {deleteSource.isSuccess && (
          <p className="mt-3 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Deleted {deleteSource.data.deleted} card sources from &ldquo;{deleteSource.data.source}
            &rdquo;
          </p>
        )}
        {deleteSource.isError && (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {deleteSource.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
