import { CheckCircle2Icon, FileUpIcon, UploadIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { Swap, Vignette } from "./vignette-parts";

const IMPORT_CSV_LINES = [
  "Variant Number,Card Name,Set,Rarity,Quantity,Language",
  "OGN-213,Hidden Blade,Origins,common,4,English",
  "SFD-154-Foil,Guards!,Spiritforged,common,3,English",
  'SFD-148a,"Draven, Audacious",Spiritforged,showcase,2,English',
];

const IMPORT_MATCHES = [
  { quantity: 4, name: "Hidden Blade", code: "OGN-213", specialties: null },
  { quantity: 3, name: "Guards!", code: "SFD-154", specialties: "Foil" },
  { quantity: 2, name: "Draven, Audacious", code: "SFD-148a", specialties: "Foil · Alt Art" },
];

export function ImportVignette() {
  return (
    <Vignette>
      <div className="border-input flex min-h-24 flex-col overflow-hidden rounded-lg border bg-transparent px-3 py-2 font-mono text-xs">
        <Swap
          className="w-full"
          was={
            <span className="text-muted-foreground">
              Paste CSV data or a plain text list here...
            </span>
          }
          now={
            <span className="flex flex-col">
              {IMPORT_CSV_LINES.map((line, index) => (
                <span
                  key={line}
                  className={cn("whitespace-nowrap", index === 0 && "text-muted-foreground")}
                >
                  {line}
                </span>
              ))}
              <span className="text-muted-foreground">...</span>
            </span>
          }
        />
      </div>
      <div className="flex items-center gap-3">
        <span className={buttonVariants()}>
          <UploadIcon className="size-4" aria-hidden="true" />
          Parse
        </span>
        <span className="text-muted-foreground text-sm">or</span>
        <span className={buttonVariants({ variant: "outline" })}>
          <FileUpIcon className="size-4" aria-hidden="true" />
          Upload file
        </span>
      </div>
      <div className="border-border/60 motion-safe:animate-vignette-now flex flex-col gap-3 border-t pt-4">
        <span className="font-heading font-medium">Import Preview</span>
        <div className="flex flex-col">
          {IMPORT_MATCHES.map((match) => (
            <span key={match.code} className="flex items-center gap-3 py-1 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground tabular-nums">{match.quantity}&times;</span>{" "}
                <span className="font-medium">{match.name}</span>
                <span className="text-muted-foreground ml-1.5 text-xs">{match.code}</span>
                {match.specialties && (
                  <span className="text-muted-foreground ml-1.5 text-xs">{match.specialties}</span>
                )}
              </span>
              <CheckCircle2Icon className="text-success size-4 shrink-0" aria-hidden="true" />
            </span>
          ))}
          <span className="text-muted-foreground py-1 text-xs">219 more</span>
        </div>
        <span className={cn(buttonVariants(), "w-fit")}>Import 412 copies</span>
      </div>
    </Vignette>
  );
}
