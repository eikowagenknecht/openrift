import type { RuleKind, RuleVersionResponse } from "@openrift/shared";
import { useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { Heading } from "@/components/heading";
import {
  SectionHeader,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useDeleteRuleVersion,
  useImportRules,
  useRuleVersions,
  useUpdateRuleVersionComments,
} from "@/hooks/use-rules";

const KIND_LABELS: Record<RuleKind, string> = {
  core: "Core",
  tournament: "Tournament",
};

const KIND_ITEMS: { value: RuleKind; label: string }[] = [
  { value: "core", label: "Core" },
  { value: "tournament", label: "Tournament" },
];

export function RulesImportPage() {
  const { data: versionsData } = useRuleVersions();
  const importMutation = useImportRules();
  const deleteMutation = useDeleteRuleVersion();

  const [kind, setKind] = useState<RuleKind>("core");
  const [version, setVersion] = useState("");
  const [comments, setComments] = useState("");
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
    const payload = {
      kind,
      version: version.trim(),
      comments: comments.trim() || null,
      content,
    };
    try {
      const response = await importMutation.mutateAsync(payload);
      setResult(response);
      setContent("");
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  async function handleDelete(targetKind: RuleKind, versionToDelete: string) {
    try {
      await deleteMutation.mutateAsync({ kind: targetKind, version: versionToDelete });
    } catch {
      /* Reported by the global mutation error toast. */
    }
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
      <AdminPageTopBar title="Rules" />
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle>Import Rules</SectionHeaderTitle>
          <SectionHeaderDescription>
            Paste rules as one per line: <code>{"<rule_number>. <markdown>"}</code>. Use{" "}
            <code># Heading</code> for titles, <code>## Subheading</code> for subtitles, and a
            literal <code>\n</code> inside a line for hard newlines.
          </SectionHeaderDescription>
        </SectionHeaderGroup>
      </SectionHeader>

      <div className="grid max-w-xl gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="kind">Kind</Label>
          <Select
            items={KIND_ITEMS}
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
              {KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Version (date)</Label>
          <DatePicker
            value={version || null}
            onChange={setVersion}
            onClear={() => setVersion("")}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="comments">Comments (optional, markdown)</Label>
          <Textarea
            id="comments"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Notes about this version, source links, change summary..."
            rows={4}
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

        <Button onClick={() => void handleImport()} disabled={!canImport}>
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
            <Heading level={3} className="mb-2">
              Existing {KIND_LABELS[targetKind]} Versions
            </Heading>
            <div className="space-y-2">
              {entries.map((entry) => (
                <VersionRow
                  key={`${entry.kind}-${entry.version}`}
                  entry={entry}
                  onDelete={(deleteKind, deleteVersion) =>
                    void handleDelete(deleteKind, deleteVersion)
                  }
                  isDeleting={deleteMutation.isPending}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VersionRow({
  entry,
  onDelete,
  isDeleting,
}: {
  entry: RuleVersionResponse;
  onDelete: (kind: RuleKind, version: string) => void;
  isDeleting: boolean;
}) {
  const updateMutation = useUpdateRuleVersionComments();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(entry.comments ?? "");

  function startEdit() {
    setDraft(entry.comments ?? "");
    setIsEditing(true);
  }

  async function save() {
    const trimmed = draft.trim();
    const payload = {
      kind: entry.kind,
      version: entry.version,
      comments: trimmed.length > 0 ? trimmed : null,
    };
    try {
      await updateMutation.mutateAsync(payload);
      setIsEditing(false);
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  function cancel() {
    setDraft(entry.comments ?? "");
    setIsEditing(false);
  }

  return (
    <div className="space-y-2 rounded-md border p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-mono font-semibold">{entry.version}</span>
          {!isEditing && entry.comments && (
            <span className="text-muted-foreground ml-2 line-clamp-1">{entry.comments}</span>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={cancel} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={startEdit}>
                Edit comments
              </Button>
              <Button
                variant="destructive"
                onClick={() => onDelete(entry.kind, entry.version)}
                disabled={isDeleting}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
      {isEditing && (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Notes about this version, source links, change summary..."
          rows={4}
          disabled={updateMutation.isPending}
        />
      )}
    </div>
  );
}
