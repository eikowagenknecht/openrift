import { Loader2Icon, PrinterIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BinderSheetPaper,
  BinderSheetSize,
  BinderSheetStyle,
} from "@/features/collections/lib/binder-sheet-specs";
import {
  BINDER_SHEET_PAPERS,
  BINDER_SHEET_SPECS,
} from "@/features/collections/lib/binder-sheet-specs";

export interface BinderSheetPanelProps {
  shareUrl: string;
  defaultTitle: string;
  defaultSubtitle: string;
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
 * Module scope, not the handler: react-compiler cannot lower an `import()`
 * expression inside a component and bails on the whole file.
 */
async function loadBinderSheetGenerator() {
  const module = await import("@/features/collections/lib/binder-sheet-pdf");
  return module.generateBinderSheetPdf;
}

export function BinderSheetPanel({
  shareUrl,
  defaultTitle,
  defaultSubtitle,
  filenameHint,
}: BinderSheetPanelProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [contact, setContact] = useState("");
  const [showLink, setShowLink] = useState(false);
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
    <div className="flex flex-col gap-4">
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
        <Button className="self-start" onClick={() => void handleCreate()} disabled={generating}>
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
    </div>
  );
}
