import { Loader2Icon, PrinterIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BinderSheetPaper, BinderSheetSize, BinderSheetStyle } from "@/lib/binder-sheet-specs";
import { BINDER_SHEET_PAPERS, BINDER_SHEET_SPECS } from "@/lib/binder-sheet-specs";

interface BinderSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The share link the QR code encodes. */
  shareUrl: string;
  /** Prefill for the title line, e.g. the owner's display name or the list name. */
  defaultTitle: string;
  /** Prefill for the instruction line under the title. */
  defaultSubtitle: string;
  /** Base name for the downloaded file. */
  filenameHint?: string;
}

const SIZE_ITEMS = (Object.keys(BINDER_SHEET_SPECS) as BinderSheetSize[]).map((value) => ({
  value,
  label: BINDER_SHEET_SPECS[value].label,
}));

const PAPER_ITEMS = (Object.keys(BINDER_SHEET_PAPERS) as BinderSheetPaper[]).map((value) => ({
  value,
  label: BINDER_SHEET_PAPERS[value].label,
}));

const STYLE_ITEMS: { value: BinderSheetStyle; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark header" },
];

/**
 * Loads the sheet generator on first use, so jsPDF, the QR encoder and the
 * brand logo raster stay off the initial graph of every page that offers a
 * share dialog. Module scope, not the handler: react-compiler cannot lower an
 * `import()` expression inside a component and bails on the whole file.
 * @returns The generator function.
 */
async function loadBinderSheetGenerator() {
  const module = await import("@/lib/binder-sheet-pdf");
  return module.generateBinderSheetPdf;
}

/**
 * Options for the printable binder QR sheet, then a PDF download. Callers own
 * the open state and pass the share link plus its prefills, so the same dialog
 * serves the all-lists bundle, a single list, and a collection.
 * @returns The binder sheet dialog.
 */
export function BinderSheetDialog({
  open,
  onOpenChange,
  shareUrl,
  defaultTitle,
  defaultSubtitle,
  filenameHint,
}: BinderSheetDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [contact, setContact] = useState("");
  const [showLink, setShowLink] = useState(false);
  // Marks are opt-in: the common case is printing a binder page and sliding it
  // straight into a sleeve, where a clean sheet is what you want.
  const [cutMarks, setCutMarks] = useState(false);
  const [ruler, setRuler] = useState(false);
  const [size, setSize] = useState<BinderSheetSize>("card");
  const [paper, setPaper] = useState<BinderSheetPaper>("a4");
  const [style, setStyle] = useState<BinderSheetStyle>("light");
  const [generating, setGenerating] = useState(false);

  const handleCreate = async () => {
    setGenerating(true);
    const generateBinderSheetPdf = await loadBinderSheetGenerator();
    // React Compiler can't yet lower try/finally; reset in both paths instead.
    try {
      await generateBinderSheetPdf({
        shareUrl,
        title: title.trim(),
        subtitle: subtitle.trim(),
        contact: contact.trim(),
        showLink,
        cutMarks,
        ruler,
        size,
        paper,
        style,
        filenameHint,
      });
      setGenerating(false);
    } catch {
      toast.error("Couldn't create the PDF. Please try again.");
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Print for your binder</DialogTitle>
          <DialogDescription>
            A QR sheet for the front of your binder. Cut it out along the marks and slide it into a
            sleeve.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="binder-sheet-title">Title</Label>
            <Input
              id="binder-sheet-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="binder-sheet-subtitle">Line under the title</Label>
            <Input
              id="binder-sheet-subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="binder-sheet-contact">Contact (optional)</Label>
            <Input
              id="binder-sheet-contact"
              value={contact}
              placeholder="Discord: summonerkai"
              onChange={(event) => setContact(event.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="binder-sheet-size">Size</Label>
            <Select
              items={SIZE_ITEMS}
              value={size}
              onValueChange={(value) => setSize(value as BinderSheetSize)}
            >
              <SelectTrigger id="binder-sheet-size" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-sm">{BINDER_SHEET_SPECS[size].hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="binder-sheet-paper">Paper</Label>
              <Select
                items={PAPER_ITEMS}
                value={paper}
                onValueChange={(value) => setPaper(value as BinderSheetPaper)}
              >
                <SelectTrigger id="binder-sheet-paper" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAPER_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="binder-sheet-style">Style</Label>
              <Select
                items={STYLE_ITEMS}
                value={style}
                onValueChange={(value) => setStyle(value as BinderSheetStyle)}
              >
                <SelectTrigger id="binder-sheet-style" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="binder-sheet-show-link"
                checked={showLink}
                onCheckedChange={(checked) => setShowLink(checked === true)}
              />
              <label htmlFor="binder-sheet-show-link" className="cursor-pointer text-sm">
                Print the link as text too, for people who can’t scan
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="binder-sheet-cut-marks"
                checked={cutMarks}
                onCheckedChange={(checked) => setCutMarks(checked === true)}
              />
              <label htmlFor="binder-sheet-cut-marks" className="cursor-pointer text-sm">
                {size === "card"
                  ? "Add cut lines between the nine copies"
                  : "Add crop marks around the sheet"}
              </label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="binder-sheet-ruler"
                checked={ruler}
                onCheckedChange={(checked) => setRuler(checked === true)}
              />
              <label htmlFor="binder-sheet-ruler" className="cursor-pointer text-sm">
                Add a 50 mm bar in the margin to check the print scale
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Print at 100% (Actual size), not Fit to page.
          </p>
          <Button className="self-start" onClick={handleCreate} disabled={generating}>
            {generating ? (
              <>
                <Loader2Icon className="animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <PrinterIcon />
                Create PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
