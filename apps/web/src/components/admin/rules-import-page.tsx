import type { RuleKind, RuleVersionResponse } from "@openrift/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDeleteRuleVersion, useImportRules, useRuleVersions } from "@/hooks/use-rules";

const KIND_LABELS: Record<RuleKind, string> = {
  core: "Core",
  tournament: "Tournament",
};

export function RulesImportPage() {
  const { data: versionsData } = useRuleVersions();
  const importMutation = useImportRules();
  const deleteMutation = useDeleteRuleVersion();

  const [kind, setKind] = useState<RuleKind>("core");
  const [version, setVersion] = useState("");
  const [sourceType, setSourceType] = useState("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<{
    kind: RuleKind;
    version: string;
    rulesCount: number;
    added: number;
    modified: number;
    removed: number;
  } | null>(null);

  async function handleImport() {
    setResult(null);
    const response = await importMutation.mutateAsync({
      kind,
      version: version.trim(),
      sourceType,
      sourceUrl: sourceUrl.trim() || null,
      publishedAt: publishedAt.trim() || null,
      content,
    });
    setResult(response);
    setContent("");
  }

  async function handleDelete(targetKind: RuleKind, versionToDelete: string) {
    await deleteMutation.mutateAsync({ kind: targetKind, version: versionToDelete });
  }

  const canImport = version.trim() && content.trim() && !importMutation.isPending;

  const versionsByKind = new Map<RuleKind, RuleVersionResponse[]>([
    ["core", []],
    ["tournament", []],
  ]);
  for (const entry of versionsData.versions) {
    versionsByKind.get(entry.kind)?.push(entry);
  }

  return (
    <div className="space-y-8 p-4">
      <div>
        <h2 className="text-lg font-semibold">Import Rules</h2>
        <p className="text-muted-foreground text-sm">
          Paste rules as one per line: <code>{"<rule_number>. <markdown>"}</code>. Use{" "}
          <code># Heading</code> for titles, <code>## Subheading</code> for subtitles, and a literal{" "}
          <code>\n</code> inside a line for hard newlines.
        </p>
      </div>

      <div className="grid max-w-xl gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              if (value === "core" || value === "tournament") {
                setKind(value);
              }
            }}
          >
            <SelectTrigger id="kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="core">Core</SelectItem>
              <SelectItem value="tournament">Tournament</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="version">Version (date)</Label>
          <Input
            id="version"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="2026-03-30"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="sourceType">Source Type</Label>
          <Select
            value={sourceType}
            onValueChange={(value) => {
              if (value) {
                setSourceType(value);
              }
            }}
          >
            <SelectTrigger id="sourceType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="html">HTML</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="sourceUrl">Source URL (optional)</Label>
          <Input
            id="sourceUrl"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="publishedAt">Published Date (optional)</Label>
          <Input
            id="publishedAt"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
            placeholder="2026-03-30"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="content">Rules Content</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              "000. # Golden and Silver Rules\n001. ## Golden Rule\n002. Card text supersedes rules text. Whenever a card fundamentally contradicts the rules, the card's indication is what is true."
            }
            rows={16}
            className="font-mono text-sm"
          />
        </div>

        <Button onClick={handleImport} disabled={!canImport}>
          {importMutation.isPending ? "Importing..." : "Import"}
        </Button>

        {result && (
          <div className="bg-muted rounded-md p-3 text-sm">
            <p className="font-semibold">
              Imported {KIND_LABELS[result.kind]} v{result.version}
            </p>
            <p>
              {result.rulesCount} rules total: {result.added} added, {result.modified} modified,{" "}
              {result.removed} removed
            </p>
          </div>
        )}

        {importMutation.isError && (
          <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
            {importMutation.error.message}
          </div>
        )}
      </div>

      {(["core", "tournament"] as const).map((targetKind) => {
        const entries = versionsByKind.get(targetKind) ?? [];
        if (entries.length === 0) {
          return null;
        }
        return (
          <div key={targetKind}>
            <h3 className="mb-2 text-sm font-semibold">
              Existing {KIND_LABELS[targetKind]} Versions
            </h3>
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.version}`}
                  className="border-border flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <span className="font-mono font-semibold">{entry.version}</span>
                    <span className="text-muted-foreground ml-2">({entry.sourceType})</span>
                    {entry.publishedAt && (
                      <span className="text-muted-foreground ml-2">
                        published {entry.publishedAt}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(entry.kind, entry.version)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
