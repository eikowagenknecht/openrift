import type { CopyLink, CopyMetadataPatch, CopyResponse, Printing } from "@openrift/shared";
import { ArrowLeftIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PickerList, PickerRow } from "@/components/ui/picker-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCopies, useUpdateCopies } from "@/hooks/use-copies";
import { useConditionList, useEnumOrders, useGraderList } from "@/hooks/use-enums";

/** What the grid resolved from the right-clicked tile. */
export interface CopyDetailsTarget {
  /** The tile's copies (one id in copies view, the whole stack otherwise). */
  copyIds: string[];
  /** Card name for the dialog title. */
  cardName: string;
  /** Printing per copy, for labeling rows when the tile spans printings. */
  printingByCopyId: Map<string, Printing>;
}

// Select sentinels for the two non-slug condition states. Real condition
// slugs are kebab-case words from the reference table, so these can't collide.
const UNRECORDED = "__unrecorded";
const GRADED = "__graded";

const MAX_LINKS = 10;
const URL_PATTERN = /^https?:\/\//u;

// 10 down to 1 in half steps, best first — slabs cluster at the top grades,
// so the common picks sit at the start of the list. String values match
// `String(copy.grade)` so the select round-trips stored grades exactly.
const GRADE_OPTIONS = Array.from({ length: 19 }, (_, index) => String(10 - index * 0.5));
const GRADE_ITEMS = Object.fromEntries(GRADE_OPTIONS.map((grade) => [grade, grade]));

interface LinkDraft {
  url: string;
  label: string;
}

/**
 * Per-copy metadata viewer/editor (ADR-038). With one target copy it opens
 * straight in the editor; with a stack it first lists the copies (condition
 * or grade summary per row) and edits the picked one. Keep mounted with a
 * null target so open/close animates.
 *
 * @returns The dialog.
 */
export function CopyDetailsDialog({
  target,
  onOpenChange,
}: {
  target: CopyDetailsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: allCopies } = useCopies();
  const [editingCopyId, setEditingCopyId] = useState<string | null>(null);

  // Seed the editor when a new target arrives: a single-copy tile skips the
  // list and opens its one copy directly. (Effect, not render-phase: BaseUI
  // only fires onOpenChange for user-initiated closes, so the dialog stays
  // mounted across targets and state would otherwise stick.)
  useEffect(() => {
    setEditingCopyId(target && target.copyIds.length === 1 ? target.copyIds[0] : null);
  }, [target]);

  if (!target) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const targetIds = new Set(target.copyIds);
  const copies = allCopies.filter((copy) => targetIds.has(copy.id));
  const editingCopy = editingCopyId ? copies.find((copy) => copy.id === editingCopyId) : undefined;
  const showList = !editingCopy;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {showList ? (
          <CopyPickerList
            target={target}
            copies={copies}
            onPick={setEditingCopyId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <CopyEditor
            key={editingCopy.id}
            copy={editingCopy}
            cardName={target.cardName}
            printing={target.printingByCopyId.get(editingCopy.id)}
            showBack={target.copyIds.length > 1}
            onBack={() => setEditingCopyId(null)}
            onDone={() =>
              target.copyIds.length > 1 ? setEditingCopyId(null) : onOpenChange(false)
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One-line condition/grade summary for a picker row.
 * @returns The summary badge, or a "No details yet" hint.
 */
function CopySummary({ copy }: { copy: CopyResponse }) {
  const { labels } = useEnumOrders();
  if (copy.grader !== null && copy.grade !== null) {
    return (
      <Badge variant="subtle">
        {labels.graders[copy.grader]} {copy.grade}
      </Badge>
    );
  }
  if (copy.condition !== null) {
    return <Badge variant="secondary">{labels.conditions[copy.condition]}</Badge>;
  }
  return <span className="text-muted-foreground text-sm">No details yet</span>;
}

function CopyPickerList({
  target,
  copies,
  onPick,
  onClose,
}: {
  target: CopyDetailsTarget;
  copies: CopyResponse[];
  onPick: (copyId: string) => void;
  onClose: () => void;
}) {
  const [highlightedId, setHighlightedId] = useState("");
  return (
    <>
      <DialogHeader>
        <DialogTitle>Copies of {target.cardName}</DialogTitle>
        <DialogDescription>
          Pick a copy to view or edit its condition, notes, and photos.
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-72 overflow-y-auto">
        <PickerList highlightedId={highlightedId} onHighlightChange={setHighlightedId}>
          {copies.map((copy, index) => {
            const printing = target.printingByCopyId.get(copy.id);
            return (
              <PickerRow
                key={copy.id}
                value={copy.id}
                onSelect={() => onPick(copy.id)}
                className="justify-between px-3 py-2"
              >
                <span className="truncate">
                  Copy {index + 1}
                  {printing && (
                    <span className="text-muted-foreground ml-2 text-sm">{printing.shortCode}</span>
                  )}
                </span>
                <CopySummary copy={copy} />
              </PickerRow>
            );
          })}
        </PickerList>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}

function CopyEditor({
  copy,
  cardName,
  printing,
  showBack,
  onBack,
  onDone,
}: {
  copy: CopyResponse;
  cardName: string;
  printing: Printing | undefined;
  showBack: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const conditions = useConditionList();
  const graders = useGraderList();
  const updateCopies = useUpdateCopies();

  const [conditionValue, setConditionValue] = useState<string>(
    copy.grader === null ? (copy.condition ?? UNRECORDED) : GRADED,
  );
  const [grader, setGrader] = useState<string>(copy.grader ?? "");
  const [gradeText, setGradeText] = useState<string>(copy.grade === null ? "" : String(copy.grade));
  const [isAltered, setIsAltered] = useState(copy.isAltered);
  const [notesPublic, setNotesPublic] = useState(copy.notesPublic ?? "");
  const [notesPrivate, setNotesPrivate] = useState(copy.notesPrivate ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(
    copy.links.map((link) => ({ url: link.url, label: link.label ?? "" })),
  );

  const isGraded = conditionValue === GRADED;
  const nonEmptyLinks = links.filter((link) => link.url.trim() !== "");
  const linksValid = nonEmptyLinks.every((link) => URL_PATTERN.test(link.url.trim()));
  const canSave = linksValid && (!isGraded || (grader !== "" && gradeText !== ""));

  const handleSave = () => {
    // Full-state patch: every field is sent, so switching between condition
    // and graded modes clears the other side explicitly.
    const patch: CopyMetadataPatch = {
      condition: !isGraded && conditionValue !== UNRECORDED ? conditionValue : null,
      grader: isGraded ? grader : null,
      grade: isGraded ? Number(gradeText) : null,
      isAltered,
      notesPublic: notesPublic.trim() === "" ? null : notesPublic.trim(),
      notesPrivate: notesPrivate.trim() === "" ? null : notesPrivate.trim(),
      links: nonEmptyLinks.map((link): CopyLink => {
        const label = link.label.trim();
        return label === "" ? { url: link.url.trim() } : { url: link.url.trim(), label };
      }),
    };
    updateCopies.mutate({ copyIds: [copy.id], patch }, { onSuccess: onDone });
  };

  return (
    <DialogForm onSubmit={handleSave}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {showBack && (
            <Button variant="ghost" size="icon-xs" onClick={onBack} aria-label="Back to copy list">
              <ArrowLeftIcon />
            </Button>
          )}
          Copy details
        </DialogTitle>
        <DialogDescription>
          {cardName}
          {printing ? ` · ${printing.shortCode}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copy-condition">Condition</Label>
          <Select
            value={conditionValue}
            onValueChange={(value) => setConditionValue(value ?? UNRECORDED)}
            items={{
              [UNRECORDED]: "Not recorded",
              [GRADED]: "Graded",
              ...Object.fromEntries(conditions.map((row) => [row.slug, row.label])),
            }}
          >
            <SelectTrigger id="copy-condition" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNRECORDED}>Not recorded</SelectItem>
              <SelectItem value={GRADED}>Graded</SelectItem>
              {conditions.map((row) => (
                <SelectItem key={row.slug} value={row.slug}>
                  {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isGraded && (
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="copy-grader">Graded by</Label>
              <Select
                value={grader === "" ? undefined : grader}
                onValueChange={(value) => setGrader(value ?? "")}
                items={Object.fromEntries(graders.map((row) => [row.slug, row.label]))}
              >
                <SelectTrigger id="copy-grader" className="w-full">
                  <SelectValue placeholder="Pick a grader" />
                </SelectTrigger>
                <SelectContent>
                  {graders.map((row) => (
                    <SelectItem key={row.slug} value={row.slug}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="copy-grade">Grade</Label>
              <Select
                value={gradeText === "" ? undefined : gradeText}
                onValueChange={(value) => setGradeText(value ?? "")}
                items={GRADE_ITEMS}
              >
                <SelectTrigger id="copy-grade" className="w-full">
                  <SelectValue placeholder="Grade" />
                </SelectTrigger>
                <SelectContent>
                  {GRADE_OPTIONS.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Switch id="copy-altered" checked={isAltered} onCheckedChange={setIsAltered} />
          <Label htmlFor="copy-altered" className="font-normal">
            Altered (signed, painted, or otherwise modified)
          </Label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copy-notes-public">Public notes</Label>
          <Textarea
            id="copy-notes-public"
            value={notesPublic}
            onChange={(event) => setNotesPublic(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Shown wherever this copy is visible, including share pages."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copy-notes-private">Private notes</Label>
          <Textarea
            id="copy-notes-private"
            value={notesPrivate}
            onChange={(event) => setNotesPrivate(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Never shown on public share pages."
          />
          <p className="text-muted-foreground text-xs">
            {copy.groupId === null
              ? "Only you can see this, even when the collection is shared with your group."
              : "This copy lives in a group collection, so everyone in the group can see this. Never shown on public share pages."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Photos &amp; videos</Label>
          {links.map((link, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- drafts have no stable identity
            <div key={index} className="flex items-center gap-2">
              <Input
                value={link.url}
                onChange={(event) =>
                  setLinks(
                    links.map((entry, i) =>
                      i === index ? { ...entry, url: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="https://…"
                aria-label={`Link ${index + 1} URL`}
                aria-invalid={link.url.trim() !== "" && !URL_PATTERN.test(link.url.trim())}
              />
              <Input
                className="w-28"
                value={link.label}
                onChange={(event) =>
                  setLinks(
                    links.map((entry, i) =>
                      i === index ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
                maxLength={100}
                placeholder="Label"
                aria-label={`Link ${index + 1} label`}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setLinks(links.filter((_entry, i) => i !== index))}
                aria-label={`Remove link ${index + 1}`}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          {links.length < MAX_LINKS && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setLinks([...links, { url: "", label: "" }])}
            >
              <PlusIcon />
              Add link
            </Button>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          onClick={showBack ? onBack : onDone}
          disabled={updateCopies.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSave || updateCopies.isPending}>
          {updateCopies.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
