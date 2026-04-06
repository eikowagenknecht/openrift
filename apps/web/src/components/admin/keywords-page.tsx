import { LoaderIcon } from "lucide-react";

import { AdminTable } from "@/components/admin/admin-table";
import type { AdminColumnDef } from "@/components/admin/admin-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useCreateKeywordStyle,
  useDeleteKeywordStyle,
  useKeywordStats,
  useRecomputeKeywords,
  useUpdateKeywordStyle,
} from "@/hooks/use-keywords";

interface KeywordRow {
  keyword: string;
  count: number;
  color: string | null;
  darkText: boolean;
}

interface KeywordDraft {
  keyword: string;
  color: string;
  darkText: boolean;
}

export function KeywordsPage() {
  const { data } = useKeywordStats();
  const recomputeKeywords = useRecomputeKeywords();
  const updateStyle = useUpdateKeywordStyle();
  const deleteStyle = useDeleteKeywordStyle();
  const createStyle = useCreateKeywordStyle();

  const styleMap = new Map(data.styles.map((s) => [s.name, s]));

  // Merge keyword counts with styles — show all keywords that exist in cards,
  // plus any styles that don't have matching cards
  const rows: KeywordRow[] = [
    ...data.counts.map((c) => {
      const style = styleMap.get(c.keyword);
      return {
        keyword: c.keyword,
        count: c.count,
        color: style?.color ?? null,
        darkText: style?.darkText ?? false,
      };
    }),
    ...data.styles
      .filter((s) => !data.counts.some((c) => c.keyword === s.name))
      .map((s) => ({ keyword: s.name, count: 0, color: s.color, darkText: s.darkText })),
  ];

  const columns: AdminColumnDef<KeywordRow, KeywordDraft>[] = [
    {
      header: "Keyword",
      sortValue: (row) => row.keyword,
      cell: (row) => <span className="font-medium">{row.keyword}</span>,
      addCell: (draft, set) => (
        <Input
          value={draft.keyword}
          onChange={(event) => set((prev) => ({ ...prev, keyword: event.target.value }))}
          placeholder="Keyword name"
          className="h-8 w-40"
        />
      ),
    },
    {
      header: "Cards",
      align: "right",
      sortValue: (row) => row.count,
      cell: (row) => <span className="font-mono text-sm">{row.count}</span>,
    },
    {
      header: "Color",
      cell: (row) =>
        row.color ? (
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-4 rounded border"
              style={{ backgroundColor: row.color }}
            />
            <span className="font-mono text-sm">{row.color}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      editCell: (draft, set) => (
        <Input
          value={draft.color}
          onChange={(event) => set((prev) => ({ ...prev, color: event.target.value }))}
          placeholder="#6366f1"
          className="h-8 w-28 font-mono"
        />
      ),
      addCell: (draft, set) => (
        <Input
          value={draft.color}
          onChange={(event) => set((prev) => ({ ...prev, color: event.target.value }))}
          placeholder="#6366f1"
          className="h-8 w-28 font-mono"
        />
      ),
    },
    {
      header: "Dark text",
      align: "center",
      cell: (row) => {
        const { color } = row;
        if (!color) {
          return null;
        }
        return (
          <input
            type="checkbox"
            checked={row.darkText}
            onChange={(event) =>
              updateStyle.mutate({
                name: row.keyword,
                color,
                darkText: event.target.checked,
              })
            }
          />
        );
      },
      editCell: (draft, set) => (
        <input
          type="checkbox"
          checked={draft.darkText}
          onChange={(event) => set((prev) => ({ ...prev, darkText: event.target.checked }))}
        />
      ),
      addCell: (draft, set) => (
        <input
          type="checkbox"
          checked={draft.darkText}
          onChange={(event) => set((prev) => ({ ...prev, darkText: event.target.checked }))}
        />
      ),
    },
    {
      header: "Preview",
      cell: (row) => (
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
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between pt-5">
          <div>
            <p className="text-sm font-medium">Recompute keywords</p>
            <p className="text-muted-foreground">
              Re-extract keywords from all card and printing text fields
            </p>
          </div>
          <div className="flex items-center gap-3">
            {recomputeKeywords.isSuccess && (
              <p className="text-muted-foreground">
                Updated {recomputeKeywords.data.updated} of {recomputeKeywords.data.totalCards}{" "}
                cards
              </p>
            )}
            {recomputeKeywords.isError && <p className="text-destructive">Failed</p>}
            <Button
              variant="outline"
              onClick={() => recomputeKeywords.mutate()}
              disabled={recomputeKeywords.isPending}
            >
              {recomputeKeywords.isPending ? <LoaderIcon className="animate-spin" /> : "Recompute"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AdminTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.keyword}
        defaultSort={{ column: "Cards", direction: "desc" }}
        emptyText="No keywords found. Try running recompute first."
        toolbar={
          <p className="text-muted-foreground text-sm">
            Keywords extracted from card and printing text. Styles control how keyword badges
            appear.
          </p>
        }
        add={{
          emptyDraft: { keyword: "", color: "#6366f1", darkText: false },
          onSave: (draft) =>
            createStyle.mutateAsync({
              name: draft.keyword.trim(),
              color: draft.color,
              darkText: draft.darkText,
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
          }),
          onSave: (draft) =>
            updateStyle.mutateAsync({
              name: draft.keyword,
              color: draft.color,
              darkText: draft.darkText,
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
    </div>
  );
}
