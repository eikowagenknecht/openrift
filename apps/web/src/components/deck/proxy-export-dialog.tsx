import type { CatalogResponse } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, PrinterIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import type { ProxyPageSize, ProxyRenderMode } from "@/lib/proxy-pdf";
import { generateProxyPdf } from "@/lib/proxy-pdf";
import { queryKeys } from "@/lib/query-keys";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

const RENDER_MODE_LABELS: Record<ProxyRenderMode, string> = {
  image: "Card images",
  text: "Text placeholders",
};

const PAGE_SIZE_LABELS: Record<ProxyPageSize, string> = {
  a4: "A4",
  letter: "US Letter",
};

export function ProxyExportDialog() {
  const [open, setOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<ProxyRenderMode>("image");
  const [pageSize, setPageSize] = useState<ProxyPageSize>("a4");
  const [cutLines, setCutLines] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const queryClient = useQueryClient();

  const handleGenerate = async () => {
    const cards = useDeckBuilderStore.getState().cards;
    if (cards.length === 0) {
      return;
    }

    // Get catalog from React Query cache
    const catalog = queryClient.getQueryData<CatalogResponse>(queryKeys.catalog.all);
    if (!catalog) {
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: 0 });

    try {
      await generateProxyPdf(
        cards,
        catalog,
        {
          pageSize,
          renderMode,
          cutLines,
          watermark,
        },
        (current, total) => {
          setProgress({ current, total });
        },
      );
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PrinterIcon className="size-4" />
        Proxies
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export as proxies</DialogTitle>
          <DialogDescription>
            Generate a printable PDF of proxy cards from this deck.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-render-mode">Render mode</Label>
            <Select
              value={renderMode}
              onValueChange={(value) => setRenderMode(value as ProxyRenderMode)}
            >
              <SelectTrigger id="proxy-render-mode">
                <SelectValue>
                  {(value: string) => RENDER_MODE_LABELS[value as ProxyRenderMode] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Card images</SelectItem>
                <SelectItem value="text">Text placeholders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-page-size">Page size</Label>
            <Select value={pageSize} onValueChange={(value) => setPageSize(value as ProxyPageSize)}>
              <SelectTrigger id="proxy-page-size">
                <SelectValue>
                  {(value: string) => PAGE_SIZE_LABELS[value as ProxyPageSize] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">US Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="proxy-cut-lines">Cut lines</Label>
            <Switch id="proxy-cut-lines" checked={cutLines} onCheckedChange={setCutLines} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="proxy-watermark">Proxy watermark</Label>
            <Switch id="proxy-watermark" checked={watermark} onCheckedChange={setWatermark} />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {progress.total > 0
                  ? `Generating ${progress.current}/${progress.total}…`
                  : "Generating…"}
              </>
            ) : (
              "Generate PDF"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
