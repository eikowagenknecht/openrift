import { Link } from "@tanstack/react-router";
import { CheckIcon, LoaderIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUploadCandidates } from "@/hooks/use-candidates";

export function CandidateUploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const upload = useUploadCandidates();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setFileName(file.name);
    setParseError(null);
    setFileData(null);

    const text = await file.text();
    try {
      const json = JSON.parse(text);
      // Support both { candidates: [...] } and bare array
      const candidates = Array.isArray(json) ? json : json.candidates;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        setParseError("JSON must contain a non-empty array of candidates");
        return;
      }
      setFileData(candidates);
    } catch {
      setParseError("Invalid JSON file");
    }
  }

  function handleUpload() {
    if (!fileData) {
      return;
    }
    upload.mutate({ source, candidates: fileData });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadIcon className="size-5 shrink-0" />
            Upload Candidates
          </CardTitle>
          <CardDescription>
            Upload a JSON file with candidate cards for review. Each candidate will be matched
            against existing cards or flagged as new.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source">Source label (optional)</Label>
            <Input
              id="source"
              placeholder="e.g. Arcane Box Set, Promo batch 2026-03"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file">JSON file</Label>
            <Input
              id="file"
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
            />
            {fileName && fileData && (
              <p className="text-sm text-muted-foreground">
                {fileName} &mdash; {fileData.length} candidate{fileData.length === 1 ? "" : "s"}
              </p>
            )}
            {parseError && (
              <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                <XIcon className="size-4" />
                {parseError}
              </p>
            )}
          </div>

          <Button disabled={!fileData || upload.isPending} onClick={handleUpload}>
            {upload.isPending ? (
              <>
                <LoaderIcon className="size-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload"
            )}
          </Button>

          {upload.isSuccess && (
            <div className="space-y-2 rounded-md border p-4">
              <p className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                <CheckIcon className="size-4" />
                Upload complete
              </p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>New cards: {upload.data.newCards}</p>
                <p>Updates to existing cards: {upload.data.updates}</p>
                {upload.data.errors.length > 0 && (
                  <div>
                    <p className="text-red-600 dark:text-red-400">
                      Errors: {upload.data.errors.length}
                    </p>
                    <ul className="ml-4 mt-1 list-disc text-xs text-red-600 dark:text-red-400">
                      {upload.data.errors.slice(0, 10).map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                      {upload.data.errors.length > 10 && (
                        <li>...and {upload.data.errors.length - 10} more</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" render={<Link to="/admin/candidates" />}>
                Review candidates
              </Button>
            </div>
          )}

          {upload.isError && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <XIcon className="size-4" />
              {upload.error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
