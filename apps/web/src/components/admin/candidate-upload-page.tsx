import type { ProviderSettingResponse, ProviderStatsResponse } from "@openrift/shared";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  ListChecksIcon,
  LoaderIcon,
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
  useCheckProvider,
  useDeleteProvider,
  useProviderNames,
  useProviderStats,
  useUploadCandidates,
} from "@/hooks/use-candidates";
import {
  useReorderProviderSettings,
  useProviderSettings,
  useUpdateProviderSetting,
} from "@/hooks/use-provider-settings";
import { client } from "@/lib/rpc-client";
import { cn } from "@/lib/utils";

export function CandidateUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState("");
  const [providerOpen, setProviderOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const upload = useUploadCandidates();
  const { data: providerNames } = useProviderNames();
  const { data: providerStats } = useProviderStats();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setFileData(null);

    if (!provider) {
      setProvider(file.name.replace(/\.json$/i, ""));
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
    if (!fileData || !provider.trim()) {
      return;
    }
    upload.mutate(
      { provider: provider.trim(), candidates: fileData },
      {
        onSuccess: () => {
          setProvider("");
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
            Upload Candidates
          </CardTitle>
          <CardDescription>
            Upload a JSON file with candidate data from an external provider. Each card will be
            staged for review and comparison against existing data.
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
              Provider name <span className="text-red-500">*</span>
            </Label>
            <Popover open={providerOpen} onOpenChange={setProviderOpen}>
              <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50">
                <span className={provider ? "text-foreground" : "text-muted-foreground"}>
                  {provider || "Select or type a provider name..."}
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
                    placeholder="Type or select a provider..."
                    value={provider}
                    onValueChange={setProvider}
                    onFocus={(e) => e.target.select()}
                  />
                  <CommandList>
                    <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">
                      No existing providers found.
                    </CommandEmpty>
                    {(() => {
                      const PINNED_PROVIDERS = ["gallery"];
                      const allNames = providerNames
                        ? [...new Set([...PINNED_PROVIDERS, ...providerNames])]
                        : PINNED_PROVIDERS;
                      return (
                        allNames.length > 0 && (
                          <CommandGroup heading="Existing providers">
                            {allNames.map((name) => (
                              <CommandItem
                                key={name}
                                value={name}
                                data-checked={provider === name || undefined}
                                onSelect={(val) => {
                                  setProvider(val);
                                  setProviderOpen(false);
                                }}
                              >
                                {name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )
                      );
                    })()}
                    {provider.trim() &&
                      !["gallery", ...(providerNames ?? [])].some(
                        (n) => n.toLowerCase() === provider.trim().toLowerCase(),
                      ) && (
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${provider.trim()}`}
                            onSelect={() => {
                              setProvider(provider.trim());
                              setProviderOpen(false);
                            }}
                          >
                            Create &ldquo;{provider.trim()}&rdquo;
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

          <Button
            disabled={!fileData || !provider.trim() || upload.isPending}
            onClick={handleUpload}
          >
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
              <div className="flex items-start gap-1 text-sm text-green-600 dark:text-green-400">
                <CheckIcon className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>
                    Cards: {upload.data.newCards} new, {upload.data.removedCards ?? 0} removed,{" "}
                    {upload.data.updates} updated, {upload.data.unchanged} unchanged
                  </p>
                  <p>
                    Printings: {upload.data.newPrintings ?? 0} new,{" "}
                    {upload.data.removedPrintings ?? 0} removed, {upload.data.printingUpdates ?? 0}{" "}
                    updated, {upload.data.printingsUnchanged ?? 0} unchanged
                  </p>
                  {upload.data.errors.length > 0 && (
                    <p className="text-red-600 dark:text-red-400">
                      {upload.data.errors.length} errors
                    </p>
                  )}
                </div>
              </div>
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
                          <th className="px-2 py-1">Short Code</th>
                          <th className="px-2 py-1">Field</th>
                          <th className="px-2 py-1">From</th>
                          <th className="px-2 py-1">To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {upload.data.updatedCards.flatMap((card) =>
                          card.fields.map((f) => (
                            <tr key={`${card.shortCode ?? card.name}-${f.field}`}>
                              <td className="px-2 py-1 font-medium">{card.name}</td>
                              <td className="px-2 py-1 text-muted-foreground">
                                {card.shortCode ?? "\u2014"}
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
              {upload.data.updatedPrintings?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Updated printings:</p>
                  <div className="max-h-64 overflow-y-auto rounded-md border text-xs">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="text-left">
                          <th className="px-2 py-1">Card</th>
                          <th className="px-2 py-1">Short Code</th>
                          <th className="px-2 py-1">Field</th>
                          <th className="px-2 py-1">From</th>
                          <th className="px-2 py-1">To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {upload.data.updatedPrintings.flatMap((printing) =>
                          printing.fields.map((f) => (
                            <tr key={`${printing.shortCode ?? printing.name}-${f.field}`}>
                              <td className="px-2 py-1 font-medium">{printing.name}</td>
                              <td className="px-2 py-1 text-muted-foreground">
                                {printing.shortCode ?? "\u2014"}
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
      {providerNames.length > 0 && (
        <ManageProvidersCard providerNames={providerNames} providerStats={providerStats} />
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
      const res = await client.api.admin["candidates"].export.$get();
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

function ManageProvidersCard({
  providerNames,
  providerStats,
}: {
  providerNames: string[];
  providerStats: ProviderStatsResponse[];
}) {
  const checkProvider = useCheckProvider();
  const deleteProvider = useDeleteProvider();
  const { data: settingsData } = useProviderSettings();
  const updateSetting = useUpdateProviderSetting();
  const reorderMutation = useReorderProviderSettings();
  const [confirming, setConfirming] = useState<string | null>(null);
  const statsByProvider = new Map(providerStats.map((s) => [s.provider, s]));
  const settingsMap = new Map(
    (settingsData?.providerSettings ?? []).map((s: ProviderSettingResponse) => [s.provider, s]),
  );
  const sortedNames = [...providerNames].sort((a, b) => {
    const aOrder = settingsMap.get(a)?.sortOrder ?? 0;
    const bOrder = settingsMap.get(b)?.sortOrder ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.localeCompare(b);
  });

  function moveProvider(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sortedNames.length) {
      return;
    }
    const reordered = [...sortedNames];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderMutation.mutate(reordered);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2Icon className="size-5 shrink-0" />
          Manage Providers
        </CardTitle>
        <CardDescription>
          Control visibility, sort order, and deletion of provider data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {sortedNames.map((name, index) => {
            const stats = statsByProvider.get(name);
            const setting = settingsMap.get(name);
            const isHidden = setting?.isHidden ?? false;
            return (
              <div
                key={name}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2",
                  isHidden && "opacity-50",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0 || reorderMutation.isPending}
                      onClick={() => moveProvider(index, -1)}
                    >
                      <ArrowUpIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === sortedNames.length - 1 || reorderMutation.isPending}
                      onClick={() => moveProvider(index, 1)}
                    >
                      <ArrowDownIcon className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => updateSetting.mutate({ provider: name, isHidden: !isHidden })}
                    title={isHidden ? "Show provider" : "Hide provider"}
                  >
                    {isHidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                  <span className="text-sm font-medium">{name}</span>
                </span>
                <span className="flex items-center gap-4">
                  {stats && (
                    <span className="text-sm text-muted-foreground">
                      {stats.cardCount} cards, {stats.printingCount} printings
                      {" \u00B7 "}
                      {new Date(stats.lastUpdated).toISOString().replace("T", " ").slice(0, 19)}
                    </span>
                  )}
                  {confirming === name ? (
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Delete all data?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleteProvider.isPending}
                        onClick={() => {
                          deleteProvider.mutate(name, {
                            onSuccess: () => setConfirming(null),
                          });
                        }}
                      >
                        {deleteProvider.isPending ? (
                          <LoaderIcon className="size-4 animate-spin" />
                        ) : (
                          "Confirm"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deleteProvider.isPending}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={checkProvider.isPending}
                        onClick={() => checkProvider.mutate(name)}
                      >
                        {checkProvider.isPending ? (
                          <LoaderIcon className="size-4 animate-spin" />
                        ) : (
                          <ListChecksIcon className="size-4" />
                        )}
                        Check all
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(name)}>
                        <Trash2Icon className="size-4" />
                        Delete
                      </Button>
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        {checkProvider.isSuccess && (
          <p className="mt-3 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Checked {checkProvider.data.cardsChecked} cards, {checkProvider.data.printingsChecked}{" "}
            printings
          </p>
        )}
        {checkProvider.isError && (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {checkProvider.error.message}
          </p>
        )}
        {deleteProvider.isSuccess && (
          <p className="mt-3 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Deleted {deleteProvider.data.deleted} candidates from &ldquo;
            {deleteProvider.data.provider}
            &rdquo;
          </p>
        )}
        {deleteProvider.isError && (
          <p className="mt-3 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {deleteProvider.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
