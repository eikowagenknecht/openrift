import type { MetaEventTier } from "@openrift/shared";
import { formatDay, formatRelativeTime } from "@openrift/shared";
import type {
  MetaSourceFormat,
  MetaSourceTemplate,
} from "@openrift/shared/contracts/admin/meta-catalog";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  MetaSourceFormatInput,
  MetaSourceTemplateInput,
} from "@/hooks/use-admin-meta-catalog";
import {
  useMetaSourceFormats,
  useMetaSourceTemplates,
  useUpdateMetaSourceFormat,
  useUpdateMetaSourceTemplate,
} from "@/hooks/use-admin-meta-catalog";
import { useDeckFormatList } from "@/hooks/use-enums";
import { META_EVENT_TIER_LABELS } from "@/lib/meta-format";

/** The Select value that stands for "mapped to nothing of ours". */
const UNMAPPED = "__unmapped";

const TIER_ITEMS: Record<string, string> = {
  [UNMAPPED]: "Unmapped",
  ...META_EVENT_TIER_LABELS,
};

/**
 * One template's row. The mutation lives on the section rather than here, so a
 * fifty-template list holds one of them instead of fifty.
 *
 * @returns The template's row.
 */
function TemplateRow({
  template,
  busy,
  onUpdate,
}: {
  template: MetaSourceTemplate;
  busy: boolean;
  onUpdate: (input: MetaSourceTemplateInput) => void;
}) {
  const name = template.sourceName ?? template.templateId;

  function toggleWatched(watched: boolean) {
    onUpdate({ templateId: template.templateId, watched });
  }

  // BaseUI hands null when the open Select is dismissed without a pick. The
  // clear is the explicit "Unmapped" item, so null is not one.
  function setTier(value: string | null) {
    if (value === null) {
      return;
    }
    onUpdate({
      templateId: template.templateId,
      tier: value === UNMAPPED ? null : (value as MetaEventTier),
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {template.sourceName ?? (
          <span className="text-muted-foreground font-mono text-xs">{template.templateId}</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-muted-foreground block max-w-64 truncate">
          {template.sampleEventName ?? "—"}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {template.eventCount.toLocaleString()}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {template.avgPlayers === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span title={`Over ${template.ranEventCount.toLocaleString()} events that have run`}>
            {template.avgPlayers.toFixed(1)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <span
          className="text-muted-foreground"
          title={template.lastStartAt === null ? undefined : formatDay(template.lastStartAt)}
        >
          {template.lastStartAt === null ? "—" : formatRelativeTime(template.lastStartAt)}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select value={template.tier ?? UNMAPPED} onValueChange={setTier} items={TIER_ITEMS}>
            <SelectTrigger className="w-36" aria-label={`Tier for ${name}`} disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TIER_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {template.tier === null && template.suggestedTier !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setTier(template.suggestedTier)}
            >
              Suggest: {META_EVENT_TIER_LABELS[template.suggestedTier]}
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Switch
          id={`meta-template-watched-${template.templateId}`}
          checked={template.watched}
          disabled={busy}
          onCheckedChange={toggleWatched}
        />
        <Label htmlFor={`meta-template-watched-${template.templateId}`} className="sr-only">
          Watch {name}
        </Label>
      </TableCell>
    </TableRow>
  );
}

function TemplatesSection() {
  const { data } = useMetaSourceTemplates();
  const update = useUpdateMetaSourceTemplate();
  const templates = data?.templates ?? [];

  return (
    <section className="space-y-2">
      <Heading level={3}>Templates</Heading>
      <p className="text-muted-foreground text-sm">
        A watched template earns its events a badge on the catalogue, a place in the daily poll, and
        eligibility for the official auto-accept rule. The tier says how much a template&apos;s
        events count for on the public meta page; mapping one reclassifies its events right away,
        and an unmapped template&apos;s events fall back to a player-count guess. The average counts
        only events that have already run, since anything from today on is still taking
        registrations. Names come from the source, refreshed on every sync; a template with only an
        id is one the source has stopped publishing.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-60">Name</TableHead>
              <TableHead>Sample event</TableHead>
              <TableHead className="w-20 text-right">Events</TableHead>
              <TableHead className="w-24 text-right">Avg players</TableHead>
              <TableHead className="w-28">Last run</TableHead>
              <TableHead className="w-56">Tier</TableHead>
              <TableHead className="w-24">Watched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground h-20 text-center">
                  {data === undefined
                    ? "Loading the templates…"
                    : "No templates yet. Run a catalogue sync to fetch them."}
                </TableCell>
              </TableRow>
            )}
            {templates.map((template) => (
              <TemplateRow
                key={template.templateId}
                template={template}
                busy={update.isPending}
                onUpdate={(input) => update.mutate(input)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/**
 * One format string's row. The mutation lives on the section for the reason
 * {@link TemplateRow} states.
 *
 * @returns The format's row.
 */
function FormatRow({
  format,
  options,
  busy,
  onUpdate,
}: {
  format: MetaSourceFormat;
  options: { value: string; label: string }[];
  busy: boolean;
  onUpdate: (input: MetaSourceFormatInput) => void;
}) {
  // Null is a dismissed Select, not a clear; unmapping is the "Unmapped" item.
  function pick(next: string | null) {
    if (next === null) {
      return;
    }
    onUpdate({
      sourceFormat: format.sourceFormat,
      mappedFormat: next === UNMAPPED ? null : next,
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{format.sourceFormat}</TableCell>
      <TableCell className="text-right tabular-nums">
        {format.eventCount.toLocaleString()}
      </TableCell>
      <TableCell>
        <Select
          items={options}
          value={format.mappedFormat ?? UNMAPPED}
          onValueChange={pick}
          disabled={busy}
        >
          <SelectTrigger className="w-48" aria-label={`Format for ${format.sourceFormat}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}

function FormatsSection() {
  const { data } = useMetaSourceFormats();
  const { formats: deckFormats } = useDeckFormatList();
  const update = useUpdateMetaSourceFormat();
  const formats = data?.formats ?? [];

  const options = [
    { value: UNMAPPED, label: "Unmapped" },
    ...deckFormats.map((entry) => ({ value: entry.slug, label: entry.label })),
  ];

  return (
    <section className="space-y-2">
      <Heading level={3}>Formats</Heading>
      <p className="text-muted-foreground text-sm">
        What the source calls a format, and which of ours it means. An unmapped format cannot be
        accepted without picking one by hand, and never auto-accepts.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>At the source</TableHead>
              <TableHead className="w-20 text-right">Events</TableHead>
              <TableHead className="w-52">Ours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formats.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground h-20 text-center">
                  {data === undefined
                    ? "Loading the formats…"
                    : "No crawled event carries a format yet."}
                </TableCell>
              </TableRow>
            )}
            {formats.map((format) => (
              <FormatRow
                key={format.sourceFormat}
                format={format}
                options={options}
                busy={update.isPending}
                onUpdate={(input) => update.mutate(input)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/**
 * The source's own vocabulary, as the crawl discovered it (ADR-014): the event
 * templates the maintainer names and watches, and the format strings they map
 * onto ours. Both used to be hardcoded lists; a template appears here because a
 * crawled event ran it, so nothing is added or removed, only named.
 *
 * @param onClose - Closes the dialog.
 * @returns The vocabulary dialog.
 */
export function MetaSourceVocabularyDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Templates &amp; formats</DialogTitle>
          <DialogDescription>
            The crawl finds these; you name them. Changes save as you make them.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto">
          <TemplatesSection />
          <FormatsSection />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
