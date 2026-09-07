import { formatDayTimeLocal } from "@openrift/shared/format-date";
import { useState } from "react";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSendScanReport } from "@/features/scan/hooks/use-scan-report";
import type { ScanJournalEntry } from "@/features/scan/lib/scan-journal";
import { readScanJournal } from "@/features/scan/lib/scan-journal";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function entryWord(count: number): string {
  return count === 1 ? "entry" : "entries";
}

function batchWord(count: number): string {
  return count === 1 ? "batch" : "batches";
}

function summarize(journal: readonly ScanJournalEntry[]): string {
  const first = journal[0];
  const last = journal.at(-1);
  if (first === undefined || last === undefined) {
    return "Nothing recorded on this device yet.";
  }
  const batches = new Set<string>();
  for (const entry of journal) {
    if (entry.type === "add-start") {
      batches.add(entry.batchId);
    }
  }
  const span = `${formatDayTimeLocal(new Date(first.t))} to ${formatDayTimeLocal(new Date(last.t))}`;
  return `${journal.length} ${entryWord(journal.length)} from ${span}, covering ${batches.size} add ${batchWord(batches.size)}.`;
}

export function ScanReportPage() {
  const [journal, setJournal] = useState<ScanJournalEntry[]>(readScanJournal);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const sendReport = useSendScanReport();

  const trimmedNote = note.trim();
  const nothingToSend = journal.length === 0 && trimmedNote.length === 0;

  async function handleSend() {
    let noteToSend: string | undefined;
    if (trimmedNote.length > 0) {
      noteToSend = trimmedNote;
    }
    const userAgent = navigator.userAgent.slice(0, 500);
    try {
      const sent = await sendReport.mutateAsync({ note: noteToSend, userAgent, journal });
      setReference(sent.reference);
      setJournal(readScanJournal());
    } catch {
      // Reported by the global mutation error toast.
    }
  }

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>Scan report</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-4 px-4 pt-3 pb-12")}>
        <p>
          This sends the scan log stored on this device: what was scanned and added, and when. No
          card images and nothing from your account.
        </p>

        {reference === null ? (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-muted-foreground">{summarize(journal)}</p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="scan-report-note">What happened?</Label>
                <Textarea
                  id="scan-report-note"
                  value={note}
                  rows={5}
                  maxLength={2000}
                  placeholder="Optional. Anything you noticed that the log will not show."
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <div>
                <Button
                  disabled={nothingToSend || sendReport.isPending}
                  onClick={() => void handleSend()}
                >
                  {sendReport.isPending ? "Sending…" : "Send report"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <p className="font-heading text-4xl font-bold">{reference}</p>
              <p>Mention this reference on Discord and we can look it up.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
