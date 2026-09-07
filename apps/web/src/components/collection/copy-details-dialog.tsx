import type {
  CardTradeLiveAnnotation,
  CopyLink,
  CopyMetadataPatch,
  CopyResponse,
  Printing,
} from "@openrift/shared";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftIcon, HandHeartIcon } from "lucide-react";
import { useState } from "react";

import { PrintingVariantLabel } from "@/components/cards/printing-label";
import { copyHasRecordedDetails, copyMarkers } from "@/components/collection/copy-indicators";
import { tradeAnnotationByCopyId } from "@/components/collection/tile-trade-status";
import type { LinkDraft } from "@/components/link-rows-field";
import { LinkRowsField } from "@/components/link-rows-field";
import { OnLoanChip } from "@/components/loans/on-loan-chip";
import { TradeStatusChip } from "@/components/trades/trade-status-chip";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveTradesByPrinting } from "@/hooks/use-card-trades";
import { useCopies, useUpdateCopies } from "@/hooks/use-copies";
import { useConditionList, useEnumOrders, useGraderList } from "@/hooks/use-enums";
import type { CopyDetailsTarget } from "@/lib/copy-details-target";
import type { EnumLabels } from "@/lib/enum-labels";
import { formatCardId } from "@/lib/format";
import { getFilterIconPath } from "@/lib/icons";
import { liveTradeStatus, tradeStatusTitle } from "@/lib/trade-status-labels";

// Select sentinels for the two non-slug condition states. Real condition
// slugs are kebab-case words from the reference table, so these can't collide.
const UNRECORDED = "__unrecorded";
const GRADED = "__graded";

const MAX_LINKS = 10;
const URL_PATTERN = /^https?:\/\//u;

// 10 down to 1 in half steps; string values match `String(copy.grade)` so the
// select round-trips stored grades exactly.
const GRADE_OPTIONS = Array.from({ length: 19 }, (_, index) => String(10 - index * 0.5));
const GRADE_ITEMS = Object.fromEntries(GRADE_OPTIONS.map((grade) => [grade, grade]));

// With one target copy it opens straight in the editor; with a stack it first
// lists the copies and edits the one picked.
export function CopyDetailsDialog({
  target,
  onOpenChange,
}: {
  target: CopyDetailsTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: allCopies } = useCopies();
  const { data: liveTrades } = useLiveTradesByPrinting();
  const [editingCopyId, setEditingCopyId] = useState<string | null>(
    target && target.copyIds.length === 1 ? target.copyIds[0] : null,
  );

  // Keyed off the target, not a useState seed: BaseUI only fires onOpenChange
  // for user-initiated closes, so the dialog stays mounted across targets.
  const [seededTarget, setSeededTarget] = useState(target);
  if (seededTarget !== target) {
    setSeededTarget(target);
    setEditingCopyId(target && target.copyIds.length === 1 ? target.copyIds[0] : null);
  }

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
  const tradeByCopyId = tradeAnnotationByCopyId(liveTrades?.annotations, target.printingByCopyId);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {showList ? (
          <CopyPickerList
            target={target}
            copies={copies}
            tradeByCopyId={tradeByCopyId}
            onPick={setEditingCopyId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <CopyEditor
            key={editingCopy.id}
            copy={editingCopy}
            tradeAnnotation={tradeByCopyId.get(editingCopy.id)}
            cardName={target.cardName}
            printing={target.printingByCopyId.get(editingCopy.id)}
            siblings={distinctPrintings(target.printingByCopyId)}
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

// Deduped so the variant label only calls out attributes that differ across
// the copies actually on screen.
function distinctPrintings(printingByCopyId: Map<string, Printing>): Printing[] {
  const byId = new Map<string, Printing>();
  for (const printing of printingByCopyId.values()) {
    byId.set(printing.id, printing);
  }
  return [...byId.values()];
}

function PrintingDescriptor({ printing, siblings }: { printing: Printing; siblings: Printing[] }) {
  const hasMixedRarities = new Set(siblings.map((p) => p.rarity)).size > 1;
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);
  return (
    <>
      <PrintingVariantLabel
        printing={printing}
        siblings={siblings}
        code={
          <span className="text-muted-foreground font-mono text-xs">{formatCardId(printing)}</span>
        }
      />
      {hasMixedRarities && rarityIcon && (
        <img
          src={rarityIcon}
          alt={printing.rarity}
          title={printing.rarity}
          width={28}
          height={28}
          className="ml-1 inline size-3.5 align-text-bottom"
        />
      )}
    </>
  );
}

function SummaryIcon({
  icon: Icon,
  label,
  content,
  count,
}: {
  icon: LucideIcon;
  label: string;
  content?: string;
  count?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        // Not a tab stop: the picker row owns keyboard focus.
        tabIndex={-1}
        className="text-muted-foreground inline-flex cursor-default items-center gap-0.5 text-sm"
        aria-label={label}
      >
        <Icon className="size-3.5" />
        {count ?? null}
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-wrap">{content ?? label}</TooltipContent>
    </Tooltip>
  );
}

function ConditionBadge({ copy, labels }: { copy: CopyResponse; labels: EnumLabels }) {
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
  return null;
}

function CopySummary({
  copy,
  tradeAnnotation,
}: {
  copy: CopyResponse;
  tradeAnnotation?: CardTradeLiveAnnotation;
}) {
  const { labels } = useEnumOrders();

  if (!copyHasRecordedDetails(copy)) {
    return <span className="text-muted-foreground text-sm">No details yet</span>;
  }

  const trade = copy.reserved && tradeAnnotation ? liveTradeStatus(tradeAnnotation) : null;

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <ConditionBadge copy={copy} labels={labels} />
      {copy.onLoan && <SummaryIcon icon={HandHeartIcon} label="On loan" />}
      {/* The icon is the direction arrow, so the label spells the direction out
          too: it is the only text a screen reader gets here. */}
      {trade && (
        <SummaryIcon
          icon={trade.icon}
          label={tradeStatusTitle({ label: trade.label, direction: trade.direction })}
        />
      )}
      {copyMarkers(copy).map((marker) => (
        <SummaryIcon
          key={marker.key}
          icon={marker.icon}
          label={marker.label}
          content={marker.content}
          count={marker.count}
        />
      ))}
    </span>
  );
}

function CopyPickerList({
  target,
  copies,
  tradeByCopyId,
  onPick,
  onClose,
}: {
  target: CopyDetailsTarget;
  copies: CopyResponse[];
  tradeByCopyId: ReadonlyMap<string, CardTradeLiveAnnotation>;
  onPick: (copyId: string) => void;
  onClose: () => void;
}) {
  const [highlightedId, setHighlightedId] = useState("");
  const siblings = distinctPrintings(target.printingByCopyId);
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
          {copies.map((copy) => {
            const printing = target.printingByCopyId.get(copy.id);
            return (
              <PickerRow
                key={copy.id}
                value={copy.id}
                onSelect={() => onPick(copy.id)}
                className="justify-between gap-3 px-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {printing && <PrintingDescriptor printing={printing} siblings={siblings} />}
                </span>
                <CopySummary copy={copy} tradeAnnotation={tradeByCopyId.get(copy.id)} />
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
  tradeAnnotation,
  cardName,
  printing,
  siblings,
  showBack,
  onBack,
  onDone,
}: {
  copy: CopyResponse;
  tradeAnnotation?: CardTradeLiveAnnotation;
  cardName: string;
  printing: Printing | undefined;
  siblings: Printing[];
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
    copy.links.map((link) => ({ url: link.url, title: link.label ?? "" })),
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
        const label = link.title.trim();
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
          {copy.onLoan && <OnLoanChip count={1} iconOnly />}
          {/* Icon only: the header is about this one copy, so the annotation's
              per-printing count would misread as this copy's. */}
          {copy.reserved && tradeAnnotation && (
            <TradeStatusChip detail="icon" annotation={tradeAnnotation} />
          )}
        </DialogTitle>
        <DialogDescription>
          {cardName}
          {printing && (
            <>
              {" · "}
              <PrintingDescriptor printing={printing} siblings={siblings} />
            </>
          )}
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
          <LinkRowsField
            links={links}
            onChange={setLinks}
            max={MAX_LINKS}
            isValidUrl={(url) => URL_PATTERN.test(url)}
            titlePlaceholder="Label"
          />
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
