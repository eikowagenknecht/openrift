import { FileUpIcon, UploadIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImportInputStepProps } from "@/features/collections/components/import-input-step-props";
import { cn, PAGE_WIDTH } from "@/lib/utils";

export function CollectionImportInputStep({
  rawText,
  onTextChange,
  onParse,
  onFileUpload,
  fileRef,
  parseErrors,
}: ImportInputStepProps) {
  return (
    <div className={cn(PAGE_WIDTH.capped, "space-y-6")}>
      <div>
        <Heading level={2}>Import Cards</Heading>
        <p className="text-muted-foreground text-sm">
          Paste or upload a CSV export, or a plain list with one{" "}
          <code className="text-foreground">quantity cardname</code> per line.
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={rawText}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste CSV data or a plain text list here..."
          // text-base below md: iOS Safari zooms the viewport when a focused
          // field is under 16px, and there is no maximum-scale to stop it.
          className="min-h-[200px] font-mono text-base md:text-xs"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => onParse(rawText)} disabled={rawText.trim().length === 0}>
            <UploadIcon className="mr-2 size-4" />
            Parse
          </Button>

          <div className="text-muted-foreground text-sm">or</div>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUpIcon className="mr-2 size-4" />
            Upload file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt,text/plain"
            onChange={onFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {parseErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {parseErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
