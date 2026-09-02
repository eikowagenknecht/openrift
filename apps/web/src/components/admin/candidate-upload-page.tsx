import type { ProviderSettingResponse, ProviderStatsResponse } from "@openrift/shared";
import { formatDay, formatDayTime } from "@openrift/shared";
import { adminCardQueriesContract } from "@openrift/shared/contracts/admin/card-queries";
import { createServerFn } from "@tanstack/react-start";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  Link2Icon,
  ListChecksIcon,
  LoaderIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
  UserCheckIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { AdminTable } from "@/components/admin/admin-table";
import type { AdminCellSlotProps, AdminColumnDef } from "@/components/admin/admin-table";
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
  useRelinkCandidatePrintings,
} from "@/hooks/use-admin-card-mutations";
import { useProviderNames, useProviderStats } from "@/hooks/use-admin-card-queries";
import type { UploadCandidatesBody } from "@/hooks/use-admin-image-mutations";
import { useUploadCandidates } from "@/hooks/use-admin-image-mutations";
import {
  useReorderProviderSettings,
  useProviderSettings,
  useUpdateProviderSetting,
} from "@/hooks/use-provider-settings";
import { flatReorder } from "@/lib/admin-reorder";
import { downloadJSONText } from "@/lib/json-export";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { cn } from "@/lib/utils";

type ParseResult =
  | { ok: true; candidates: UploadCandidatesBody["candidates"] }
  | { ok: false; error: "invalid-json" | "empty-or-wrong-shape" };

/**
 * Parses a candidates JSON file. Accepts either a bare array or `{ candidates: [...] }`.
 *
 * Kept as a module-level helper so react-compiler doesn't try to lower the ternary + logical
 * expressions inside the try/catch (it bails on "value blocks" within try statements).
 * @param text Raw file contents.
 * @returns Parsed candidates on success; otherwise a tagged error indicating which failure occurred.
 */
function parseCandidates(text: string): ParseResult {
  try {
    const json = JSON.parse(text) as unknown[] | { candidates?: unknown };
    const candidates = Array.isArray(json) ? json : json.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return { ok: false, error: "empty-or-wrong-shape" };
    }
    return { ok: true, candidates: candidates as UploadCandidatesBody["candidates"] };
  } catch {
    return { ok: false, error: "invalid-json" };
  }
}

const exportCardsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(async ({ context }): Promise<string> => {
    // The export is a loose passthrough JSON array; serialize it server-side to
    // a string (trivially serializable across the server-fn boundary) — the
    // client just writes it to a download blob.
    const data = await apiOrpcClient(adminCardQueriesContract, context.cookie).exportCandidates();
    return JSON.stringify(data, null, 2);
  });

export function CandidateUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState("");
  const [providerOpen, setProviderOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<UploadCandidatesBody["candidates"] | null>(null);
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

    setProvider(file.name.replace(/\.json$/iu, ""));

    let text: string;
    try {
      text = await file.text();
    } catch {
      setParseError("Could not read that file");
      return;
    }
    const parsed = parseCandidates(text);
    if (!parsed.ok) {
      setParseError(
        parsed.error === "invalid-json"
          ? "Invalid JSON file"
          : "JSON must contain a non-empty array of candidates",
      );
      return;
    }
    setFileData(parsed.candidates);
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
      <AdminPageTopBar title="Sources" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadIcon className="size-5 shrink-0" />
            Upload Candidates
          </CardTitle>
          <CardDescription>Candidates are staged for review against existing data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormatHelp />

          <div className="space-y-2">
            <Label htmlFor="file">JSON file</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(event) => void handleFileChange(event)}
            />
            {fileName && fileData && (
              <p className="text-muted-foreground text-sm">
                {fileName} ({fileData.length} card{fileData.length === 1 ? "" : "s"})
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
              <PopoverTrigger className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50">
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
                    <CommandEmpty className="text-muted-foreground py-3 text-center text-sm">
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
            <p className="text-muted-foreground">
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
                  <p className="font-medium">
                    Upload complete for &ldquo;{upload.data.provider}&rdquo;
                  </p>
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
                <ul className="ml-5 list-disc text-red-600 dark:text-red-400">
                  {upload.data.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {upload.data.errors.length > 10 && (
                    <li>...and {upload.data.errors.length - 10} more</li>
                  )}
                </ul>
              )}
              {upload.data.newCardDetails?.length > 0 && (
                <ItemList label="Added cards" items={upload.data.newCardDetails} />
              )}
              {upload.data.removedCardDetails?.length > 0 && (
                <ItemList label="Removed cards" items={upload.data.removedCardDetails} />
              )}
              {upload.data.updatedCards.length > 0 && (
                <DiffTable label="Updated cards" items={upload.data.updatedCards} />
              )}
              {upload.data.newPrintingDetails?.length > 0 && (
                <ItemList label="Added printings" items={upload.data.newPrintingDetails} />
              )}
              {upload.data.removedPrintingDetails?.length > 0 && (
                <ItemList label="Removed printings" items={upload.data.removedPrintingDetails} />
              )}
              {upload.data.updatedPrintings?.length > 0 && (
                <DiffTable label="Updated printings" items={upload.data.updatedPrintings} />
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
      <RelinkCandidatesCard />
      <ExportCardsCard />
      {providerNames.length > 0 && (
        <ManageProvidersCard providerNames={providerNames} providerStats={providerStats} />
      )}
    </div>
  );
}

const EXAMPLE_CANDIDATES_JSON = `[
  {
    "card": {
      "name": "Jinx, Rebel",
      "external_id": "jinx-rebel-001",
      "types": ["unit"],
      "super_types": ["champion"],
      "domains": ["chaos"],
      "might": 3,
      "energy": 2,
      "power": null,
      "rules_text": "When this unit attacks, deal 2 damage to target unit.",
      "effect_text": null,
      "tags": ["Punk"],
      "short_code": "OGN-202"
    },
    "printings": [
      {
        "short_code": "OGN-202",
        "external_id": "jinx-rebel-001-en-foil",
        "set_id": "ogn",
        "set_name": "Origins",
        "rarity": "rare",
        "finish": "foil",
        "artist": "Jane Doe",
        "language": "EN",
        "image_url": "https://example.com/cards/jinx-rebel.jpg"
      }
    ]
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
          The file must contain a JSON array of entries (or an object with a{" "}
          <code className="bg-muted rounded px-1">candidates</code> field holding the array). Each
          entry has a <code className="bg-muted rounded px-1">card</code> object and a{" "}
          <code className="bg-muted rounded px-1">printings</code> array. Field names use
          snake_case.
        </p>
        <p>
          <span className="font-medium">Required card fields:</span>{" "}
          <code className="bg-muted rounded px-1">name</code>,{" "}
          <code className="bg-muted rounded px-1">external_id</code>. Optional:{" "}
          <code className="bg-muted rounded px-1">type</code>,{" "}
          <code className="bg-muted rounded px-1">super_types</code>,{" "}
          <code className="bg-muted rounded px-1">domains</code>,{" "}
          <code className="bg-muted rounded px-1">might</code>,{" "}
          <code className="bg-muted rounded px-1">energy</code>,{" "}
          <code className="bg-muted rounded px-1">power</code>,{" "}
          <code className="bg-muted rounded px-1">might_bonus</code>,{" "}
          <code className="bg-muted rounded px-1">rules_text</code>,{" "}
          <code className="bg-muted rounded px-1">effect_text</code>,{" "}
          <code className="bg-muted rounded px-1">tags</code>,{" "}
          <code className="bg-muted rounded px-1">short_code</code>,{" "}
          <code className="bg-muted rounded px-1">extra_data</code>.
        </p>
        <p>
          <span className="font-medium">Required printing fields:</span>{" "}
          <code className="bg-muted rounded px-1">short_code</code>,{" "}
          <code className="bg-muted rounded px-1">external_id</code>. Optional:{" "}
          <code className="bg-muted rounded px-1">set_id</code>,{" "}
          <code className="bg-muted rounded px-1">set_name</code>,{" "}
          <code className="bg-muted rounded px-1">rarity</code>,{" "}
          <code className="bg-muted rounded px-1">art_variant</code>,{" "}
          <code className="bg-muted rounded px-1">is_signed</code>,{" "}
          <code className="bg-muted rounded px-1">marker_slugs</code>,{" "}
          <code className="bg-muted rounded px-1">distribution_channel_slugs</code>,{" "}
          <code className="bg-muted rounded px-1">finish</code>,{" "}
          <code className="bg-muted rounded px-1">artist</code>,{" "}
          <code className="bg-muted rounded px-1">public_code</code>,{" "}
          <code className="bg-muted rounded px-1">printed_rules_text</code>,{" "}
          <code className="bg-muted rounded px-1">printed_effect_text</code>,{" "}
          <code className="bg-muted rounded px-1">image_url</code>,{" "}
          <code className="bg-muted rounded px-1">flavor_text</code>,{" "}
          <code className="bg-muted rounded px-1">language</code>,{" "}
          <code className="bg-muted rounded px-1">printed_name</code>,{" "}
          <code className="bg-muted rounded px-1">printed_year</code>,{" "}
          <code className="bg-muted rounded px-1">extra_data</code>.
        </p>
        <p className="text-muted-foreground">
          Tip: use Export All Cards below to download a real file in the same format.
        </p>
        <p>Example:</p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3">
          <code>{EXAMPLE_CANDIDATES_JSON}</code>
        </pre>
      </div>
    </details>
  );
}

function ItemList({
  label,
  items,
}: {
  label: string;
  items: { name: string; shortCode: string | null }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm font-medium">{label}:</p>
      <div className="max-h-64 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Short Code</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item, i) => (
              <tr key={i}>
                <td className="px-2 py-1 font-medium">{item.name}</td>
                <td className="text-muted-foreground px-2 py-1">{item.shortCode ?? "\u2014"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffTable({
  label,
  items,
}: {
  label: string;
  items: {
    name: string;
    shortCode: string | null;
    fields: { field: string; from: unknown; to: unknown }[];
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
              <th className="px-2 py-1">Short Code</th>
              <th className="px-2 py-1">Field</th>
              <th className="px-2 py-1">From</th>
              <th className="px-2 py-1">To</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.flatMap((item, ci) =>
              item.fields.map((f, fi) => (
                <tr key={`${ci}-${fi}`}>
                  <td className="px-2 py-1 font-medium">{item.name}</td>
                  <td className="text-muted-foreground px-2 py-1">{item.shortCode ?? "\u2014"}</td>
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
  );
}

function RelinkCandidatesCard() {
  const relink = useRelinkCandidatePrintings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2Icon className="size-5 shrink-0" />
          Relink Candidates
        </CardTitle>
        <CardDescription>
          Candidates only link at upload time. Run this to match candidates stranded by printings
          accepted since.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={relink.isPending} onClick={() => relink.mutate()}>
          {relink.isPending ? (
            <>
              <LoaderIcon className="size-4 animate-spin" />
              Relinking...
            </>
          ) : (
            "Relink Now"
          )}
        </Button>
        {relink.isSuccess && (
          <p className="text-muted-foreground mt-2 text-sm">
            Linked {relink.data.linked} of {relink.data.examined} unlinked candidate printings.
          </p>
        )}
        {relink.isError && (
          <p className="mt-2 flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {relink.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The export server fn surfaces an ORPCError (or any Error) whose prototype is
 * dropped crossing the server-fn boundary, so the message is read structurally
 * rather than via `instanceof`. Module-level because the compiler bails on a
 * branch inside a `catch`.
 * @returns The error's message, or the fallback.
 */
function exportErrorText(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "Export failed";
}

function ExportCardsCard() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const json = await exportCardsFn();
      downloadJSONText(json, `cards-export-${formatDay(new Date())}.json`);
      setExporting(false);
    } catch (error_) {
      setError(exportErrorText(error_));
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
        <CardDescription>Same JSON format as uploads.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button disabled={exporting} onClick={() => void handleExport()}>
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

interface ProviderRow {
  name: string;
  stats: ProviderStatsResponse | undefined;
  isHidden: boolean;
  isFavorite: boolean;
  helperReviewable: boolean;
}

function ProviderNameCell({ row }: AdminCellSlotProps<ProviderRow>) {
  const updateSetting = useUpdateProviderSetting();
  if (!row) {
    return null;
  }
  return (
    <span className={cn("flex items-center gap-2", row.isHidden && "opacity-50")}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={() => updateSetting.mutate({ provider: row.name, isHidden: !row.isHidden })}
        title={row.isHidden ? "Show provider" : "Hide provider"}
        aria-label={row.isHidden ? "Show provider" : "Hide provider"}
      >
        {row.isHidden ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
      <span className="text-sm font-medium">{row.name}</span>
    </span>
  );
}

function ProviderFavoriteCell({ row }: AdminCellSlotProps<ProviderRow>) {
  const updateSetting = useUpdateProviderSetting();
  if (!row) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={row.isFavorite ? "text-yellow-500" : "text-muted-foreground"}
      onClick={() => updateSetting.mutate({ provider: row.name, isFavorite: !row.isFavorite })}
      title={row.isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-label={row.isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <StarIcon className="size-4" fill={row.isFavorite ? "currentColor" : "none"} />
    </Button>
  );
}

function ProviderHelperReviewableCell({ row }: AdminCellSlotProps<ProviderRow>) {
  const updateSetting = useUpdateProviderSetting();
  if (!row) {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={row.helperReviewable ? "text-primary" : "text-muted-foreground"}
      onClick={() =>
        updateSetting.mutate({ provider: row.name, helperReviewable: !row.helperReviewable })
      }
      title={
        row.helperReviewable
          ? "Disallow card-review grant holders"
          : "Allow card-review grant holders"
      }
      aria-label={
        row.helperReviewable
          ? "Disallow card-review grant holders"
          : "Allow card-review grant holders"
      }
    >
      <UserCheckIcon className="size-4" />
    </Button>
  );
}

function ProviderCardCountCell({ row }: AdminCellSlotProps<ProviderRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.stats?.cardCount ?? 0}</span>;
}

function ProviderPrintingCountCell({ row }: AdminCellSlotProps<ProviderRow>) {
  if (!row) {
    return null;
  }
  return <span className="text-muted-foreground text-sm">{row.stats?.printingCount ?? 0}</span>;
}

function ProviderLastUpdatedCell({ row }: AdminCellSlotProps<ProviderRow>) {
  if (!row) {
    return null;
  }
  return (
    <span className="text-muted-foreground text-sm">
      {row.stats ? formatDayTime(row.stats.lastUpdated) : "—"}
    </span>
  );
}

function ProviderCheckAction({ row }: AdminCellSlotProps<ProviderRow>) {
  const checkProvider = useCheckProvider();
  if (!row) {
    return null;
  }
  return (
    <Button
      variant="ghost"
      disabled={checkProvider.isPending}
      onClick={() => checkProvider.mutate(row.name)}
    >
      {checkProvider.isPending ? (
        <LoaderIcon className="size-4 animate-spin" />
      ) : (
        <ListChecksIcon className="size-4" />
      )}
      Check all
    </Button>
  );
}

const providerColumns: AdminColumnDef<ProviderRow>[] = [
  {
    header: "Provider",
    cell: <ProviderNameCell />,
  },
  {
    header: "Favorite",
    width: "w-20",
    cell: <ProviderFavoriteCell />,
  },
  {
    header: "Helper",
    width: "w-20",
    cell: <ProviderHelperReviewableCell />,
  },
  {
    header: "Cards",
    width: "w-24",
    align: "right",
    sortValue: (r) => r.stats?.cardCount ?? 0,
    cell: <ProviderCardCountCell />,
  },
  {
    header: "Printings",
    width: "w-24",
    align: "right",
    sortValue: (r) => r.stats?.printingCount ?? 0,
    cell: <ProviderPrintingCountCell />,
  },
  {
    header: "Last Updated",
    width: "w-44",
    sortValue: (r) => r.stats?.lastUpdated ?? null,
    cell: <ProviderLastUpdatedCell />,
  },
];

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
  const reorderMutation = useReorderProviderSettings();
  const statsByProvider = new Map(providerStats.map((s) => [s.provider, s]));
  const settingsMap = new Map(
    (settingsData?.providerSettings ?? []).map((s: ProviderSettingResponse) => [s.provider, s]),
  );
  const rows: ProviderRow[] = [...providerNames]
    .sort((a, b) => {
      const aOrder = settingsMap.get(a)?.sortOrder ?? 0;
      const bOrder = settingsMap.get(b)?.sortOrder ?? 0;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.localeCompare(b);
    })
    .map((name) => ({
      name,
      stats: statsByProvider.get(name),
      isHidden: settingsMap.get(name)?.isHidden ?? false,
      isFavorite: settingsMap.get(name)?.isFavorite ?? false,
      helperReviewable: settingsMap.get(name)?.helperReviewable ?? false,
    }));

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
      <CardContent className="space-y-3">
        <AdminTable
          columns={providerColumns}
          data={rows}
          getRowKey={(r) => r.name}
          emptyText="No providers yet."
          reorder={{
            moves: flatReorder(rows, (r) => r.name),
            onReorder: (keys) => reorderMutation.mutateAsync(keys),
            isPending: reorderMutation.isPending,
          }}
          delete={{
            onDelete: (r) => deleteProvider.mutateAsync(r.name),
            confirm: (r) => ({
              title: `Delete provider \u201C${r.name}\u201D?`,
              description: `This will permanently delete all candidate cards and printings from \u201C${r.name}\u201D. This cannot be undone.`,
            }),
          }}
          actions={<ProviderCheckAction />}
        />
        {checkProvider.isSuccess && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Checked {checkProvider.data.cardsChecked} cards, {checkProvider.data.printingsChecked}{" "}
            printings
          </p>
        )}
        {checkProvider.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {checkProvider.error.message}
          </p>
        )}
        {deleteProvider.isSuccess && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="size-4" />
            Deleted {deleteProvider.data.deleted} candidates from &ldquo;
            {deleteProvider.data.provider}
            &rdquo;
          </p>
        )}
        {deleteProvider.isError && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <XIcon className="size-4" />
            {deleteProvider.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
