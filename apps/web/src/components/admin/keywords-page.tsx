import { WellKnown } from "@openrift/shared/well-known";
import { LoaderIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { AdminTable } from "@/components/admin/admin-table";
import type {
  AdminCellSlotProps,
  AdminColumnDef,
  AdminDraftSlotProps,
} from "@/components/admin/admin-table";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLanguageLabels } from "@/hooks/use-enums";
import {
  useCreateKeywordStyle,
  useDeleteKeywordStyle,
  useDeleteTranslation,
  useDiscoverTranslations,
  useKeywordStats,
  useRecomputeKeywords,
  useUpdateKeywordStyle,
  useUpsertTranslation,
} from "@/hooks/use-keywords";

// Fallback badge color, matching getKeywordStyle's FALLBACK_COLOR. Used when a
// keyword with no style row is flagged as a cost keyword (which needs a row).
const FALLBACK_KEYWORD_COLOR = "#6a6a6a";

interface KeywordRow {
  keyword: string;
  count: number;
  color: string | null;
  darkText: boolean;
  costKeyword: boolean;
  translations: { language: string; label: string }[];
}

interface KeywordDraft {
  keyword: string;
  color: string;
  darkText: boolean;
  costKeyword: boolean;
}

interface TranslationRow {
  keywordName: string;
  language: string;
  label: string;
}

function KeywordCell({ row }: AdminCellSlotProps<KeywordRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-medium">{row.keyword}</span>;
}

function CountCell({ row }: AdminCellSlotProps<KeywordRow>) {
  if (!row) {
    return null;
  }
  return <span className="font-mono text-sm">{row.count}</span>;
}

function ColorCell({ row }: AdminCellSlotProps<KeywordRow>) {
  if (!row) {
    return null;
  }
  if (!row.color) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block size-4 rounded-md border"
        style={{ backgroundColor: row.color }}
      />
      <span className="font-mono text-sm">{row.color}</span>
    </div>
  );
}

function DarkTextCell({ row }: AdminCellSlotProps<KeywordRow>) {
  const updateStyle = useUpdateKeywordStyle();
  if (!row || !row.color) {
    return null;
  }
  const color = row.color;
  return (
    <Checkbox
      checked={row.darkText}
      onCheckedChange={(checked) =>
        updateStyle.mutate({
          name: row.keyword,
          color,
          darkText: checked,
          costKeyword: row.costKeyword,
        })
      }
    />
  );
}

function TranslationsCell({ row }: AdminCellSlotProps<KeywordRow>) {
  if (!row) {
    return null;
  }
  if (row.translations.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {row.translations.map((t) => (
        <span key={t.language} className="text-muted-foreground text-xs">
          {t.language}: {t.label}
        </span>
      ))}
    </div>
  );
}

function PreviewCell({ row }: AdminCellSlotProps<KeywordRow>) {
  if (!row) {
    return null;
  }
  return (
    <Badge
      style={
        row.color
          ? {
              backgroundColor: row.color,
              color: row.darkText ? "#1a1a1a" : "#ffffff",
            }
          : undefined
      }
      variant={row.color ? "default" : "secondary"}
    >
      {row.keyword}
    </Badge>
  );
}

function KeywordAddInput({ draft, setDraft }: AdminDraftSlotProps<KeywordDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.keyword}
      onChange={(event) => setDraft((prev) => ({ ...prev, keyword: event.target.value }))}
      placeholder="Keyword name"
      className="h-8 w-40"
    />
  );
}

function ColorInput({ draft, setDraft }: AdminDraftSlotProps<KeywordDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Input
      value={draft.color}
      onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
      placeholder="#6366f1"
      className="h-8 w-28 font-mono"
    />
  );
}

function DarkTextInput({ draft, setDraft }: AdminDraftSlotProps<KeywordDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Checkbox
      checked={draft.darkText}
      onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, darkText: checked }))}
    />
  );
}

function CostKeywordCell({ row }: AdminCellSlotProps<KeywordRow>) {
  const updateStyle = useUpdateKeywordStyle();
  if (!row) {
    return null;
  }
  // Toggling on a keyword with no style row still needs a row to hold the flag,
  // so fall back to the neutral badge color (keeps the rendered badge unchanged).
  return (
    <Checkbox
      checked={row.costKeyword}
      onCheckedChange={(checked) =>
        updateStyle.mutate({
          name: row.keyword,
          color: row.color ?? FALLBACK_KEYWORD_COLOR,
          darkText: row.darkText,
          costKeyword: checked,
        })
      }
    />
  );
}

function CostKeywordInput({ draft, setDraft }: AdminDraftSlotProps<KeywordDraft>) {
  if (!draft || !setDraft) {
    return null;
  }
  return (
    <Checkbox
      checked={draft.costKeyword}
      onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, costKeyword: checked }))}
    />
  );
}

const columns: AdminColumnDef<KeywordRow, KeywordDraft>[] = [
  {
    header: "Keyword",
    sortValue: (row) => row.keyword,
    cell: <KeywordCell />,
    addCell: <KeywordAddInput />,
  },
  {
    header: "Cards",
    align: "right",
    sortValue: (row) => row.count,
    cell: <CountCell />,
  },
  {
    header: "Color",
    cell: <ColorCell />,
    editCell: <ColorInput />,
    addCell: <ColorInput />,
  },
  {
    header: "Dark text",
    align: "center",
    cell: <DarkTextCell />,
    editCell: <DarkTextInput />,
    addCell: <DarkTextInput />,
  },
  {
    header: "Cost keyword",
    align: "center",
    cell: <CostKeywordCell />,
    editCell: <CostKeywordInput />,
    addCell: <CostKeywordInput />,
  },
  {
    header: "Translations",
    cell: <TranslationsCell />,
  },
  {
    header: "Preview",
    cell: <PreviewCell />,
  },
];

export function KeywordsPage() {
  const { data } = useKeywordStats();
  const recomputeKeywords = useRecomputeKeywords();
  const discoverTranslations = useDiscoverTranslations();
  const updateStyle = useUpdateKeywordStyle();
  const deleteStyle = useDeleteKeywordStyle();
  const createStyle = useCreateKeywordStyle();

  const styleMap = new Map(data.styles.map((s) => [s.name, s]));
  const translationsByKeyword = Map.groupBy(data.translations, (t) => t.keywordName);

  const rows: KeywordRow[] = [
    ...data.counts.map((c) => {
      const style = styleMap.get(c.keyword);
      return {
        keyword: c.keyword,
        count: c.count,
        color: style?.color ?? null,
        darkText: style?.darkText ?? false,
        costKeyword: style?.costKeyword ?? false,
        translations: translationsByKeyword.get(c.keyword) ?? [],
      };
    }),
    ...data.styles
      .filter((s) => !data.counts.some((c) => c.keyword === s.name))
      .map((s) => ({
        keyword: s.name,
        count: 0,
        color: s.color,
        darkText: s.darkText,
        costKeyword: s.costKeyword,
        translations: translationsByKeyword.get(s.name) ?? [],
      })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recompute keywords</p>
              <p className="text-muted-foreground text-sm">
                Re-extract keywords from all card and printing text fields
              </p>
            </div>
            <div className="flex items-center gap-3">
              {recomputeKeywords.isSuccess && (
                <p className="text-muted-foreground text-sm">
                  Updated {recomputeKeywords.data.updated} of {recomputeKeywords.data.totalCards}{" "}
                  cards
                </p>
              )}
              {recomputeKeywords.isError && <p className="text-destructive text-sm">Failed</p>}
              <Button
                variant="outline"
                onClick={() => recomputeKeywords.mutate()}
                disabled={recomputeKeywords.isPending}
              >
                {recomputeKeywords.isPending ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  "Recompute"
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-discover translations</p>
              <p className="text-muted-foreground text-sm">
                Correlate EN and non-EN printings to find keyword translations
              </p>
            </div>
            <div className="flex items-center gap-3">
              {discoverTranslations.isSuccess && (
                <p className="text-muted-foreground text-sm">
                  Found {discoverTranslations.data.discovered.length}, inserted{" "}
                  {discoverTranslations.data.inserted}
                  {discoverTranslations.data.conflicts.length > 0 &&
                    `, ${discoverTranslations.data.conflicts.length} conflicts`}
                </p>
              )}
              {discoverTranslations.isError && <p className="text-destructive text-sm">Failed</p>}
              <Button
                variant="outline"
                onClick={() => discoverTranslations.mutate()}
                disabled={discoverTranslations.isPending}
              >
                {discoverTranslations.isPending ? (
                  <LoaderIcon className="animate-spin" />
                ) : (
                  "Discover"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {discoverTranslations.isSuccess && discoverTranslations.data.conflicts.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-2 text-sm font-medium">Translation conflicts (needs manual review)</p>
            <div className="space-y-1">
              {discoverTranslations.data.conflicts.map((conflict) => (
                <p key={`${conflict.keyword}-${conflict.language}`} className="text-sm">
                  <span className="font-medium">{conflict.keyword}</span> ({conflict.language}):{" "}
                  {conflict.labels.join(" / ")}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AdminTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.keyword}
        defaultSort={{ column: "Cards", direction: "desc" }}
        emptyText="No keywords found. Try running recompute first."
        title="Keywords"
        toolbar={
          <PageDescription>
            Keywords extracted from card and printing text. Styles control how keyword badges
            appear.
          </PageDescription>
        }
        add={{
          emptyDraft: { keyword: "", color: "#6366f1", darkText: false, costKeyword: false },
          onSave: (draft) =>
            createStyle.mutateAsync({
              name: draft.keyword.trim(),
              color: draft.color,
              darkText: draft.darkText,
              costKeyword: draft.costKeyword,
            }),
          validate: (draft) => {
            const name = draft.keyword.trim();
            if (!name) {
              return "Keyword name is required";
            }
            if (data.styles.some((s) => s.name === name)) {
              return "Style already exists for this keyword";
            }
            return null;
          },
          label: "Add Style",
        }}
        edit={{
          toDraft: (row) => ({
            keyword: row.keyword,
            color: row.color ?? "#707070",
            darkText: row.darkText,
            costKeyword: row.costKeyword,
          }),
          onSave: (draft) =>
            updateStyle.mutateAsync({
              name: draft.keyword,
              color: draft.color,
              darkText: draft.darkText,
              costKeyword: draft.costKeyword,
            }),
        }}
        delete={{
          onDelete: (row) => deleteStyle.mutateAsync(row.keyword),
          confirm: (row) => ({
            title: `Delete style for "${row.keyword}"?`,
            description: "The keyword will still appear on cards but without custom styling.",
          }),
        }}
      />

      <TranslationsTable
        translations={data.translations}
        keywordNames={data.styles.map((s) => s.name)}
        languageLabels={useLanguageLabels()}
      />
    </div>
  );
}

function TranslationsTable({
  translations,
  keywordNames,
  languageLabels,
}: {
  translations: TranslationRow[];
  keywordNames: string[];
  languageLabels: Record<string, string>;
}) {
  const upsertTranslation = useUpsertTranslation();
  const deleteTranslation = useDeleteTranslation();
  const [addKeyword, setAddKeyword] = useState("");
  const [addLanguage, setAddLanguage] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  async function handleSaveEdit(row: TranslationRow) {
    const label = editLabel.trim();
    if (!label) {
      return;
    }
    try {
      await upsertTranslation.mutateAsync({
        keywordName: row.keywordName,
        language: row.language,
        label,
      });
      setEditingKey(null);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  async function handleDelete(row: TranslationRow) {
    try {
      await deleteTranslation.mutateAsync({
        keywordName: row.keywordName,
        language: row.language,
      });
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  async function handleAdd() {
    try {
      await upsertTranslation.mutateAsync({
        keywordName: addKeyword.trim(),
        language: addLanguage.trim(),
        label: addLabel.trim(),
      });
      setAddKeyword("");
      setAddLanguage("");
      setAddLabel("");
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="mb-3 text-sm font-medium">Keyword Translations</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {translations.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground text-center">
                  No translations yet. Try running auto-discover.
                </TableCell>
              </TableRow>
            )}
            {translations.map((t) => {
              const key = `${t.keywordName}-${t.language}`;
              const isEditing = editingKey === key;
              return (
                <TableRow key={key}>
                  <TableCell className="font-medium">{t.keywordName}</TableCell>
                  <TableCell>{t.language}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editLabel}
                        onChange={(event) => setEditLabel(event.target.value)}
                        className="h-7 w-40 text-sm"
                      />
                    ) : (
                      t.label
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void handleSaveEdit(t)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setEditingKey(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditingKey(key);
                            setEditLabel(t.label);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive h-7 text-xs"
                          onClick={() => void handleDelete(t)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell>
                <Select value={addKeyword} onValueChange={(value) => setAddKeyword(value ?? "")}>
                  <SelectTrigger className="h-7 w-40 text-sm" size="sm">
                    <SelectValue placeholder="Keyword" />
                  </SelectTrigger>
                  <SelectContent>
                    {keywordNames.toSorted().map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={addLanguage} onValueChange={(value) => setAddLanguage(value ?? "")}>
                  <SelectTrigger className="h-7 w-28 text-sm" size="sm">
                    <SelectValue placeholder="Language">
                      {(value: string) => `${value} — ${languageLabels[value] ?? value}`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(languageLabels)
                      .filter(([code]) => code !== WellKnown.language.EN)
                      .map(([code, name]) => (
                        <SelectItem key={code} value={code}>
                          {code} — {name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  value={addLabel}
                  onChange={(event) => setAddLabel(event.target.value)}
                  placeholder="Translation"
                  className="h-7 w-40 text-sm"
                />
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!addKeyword.trim() || !addLanguage.trim() || !addLabel.trim()}
                  onClick={() => void handleAdd()}
                >
                  <PlusIcon className="size-3" /> Add
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
