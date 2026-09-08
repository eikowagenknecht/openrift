import { useRef, useState } from "react";
import { toast } from "sonner";

import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import type { IdentifyAttempt, UnidentifiedCard } from "@/features/scan/lib/scan-catchup";
import type { IdentifyCandidate } from "@/features/scan/lib/scan-identify";
import { toIdentifyCandidates } from "@/features/scan/lib/scan-identify";

interface ScanIdentifyOptions {
  loaded: LoadedScanBank | null;
  identifyNow: (onSnapshot?: (snapshot: string | null) => void) => Promise<IdentifyAttempt>;
  unidentified: UnidentifiedCard[];
  dismissUnidentified: (id: string) => void;
  onPick: (candidate: IdentifyCandidate) => void;
}

interface ScanIdentify {
  open: boolean;
  snapshot: string | null;
  pending: boolean;
  candidates: IdentifyCandidate[];
  run: () => void;
  dismiss: () => void;
  pick: (candidate: IdentifyCandidate) => void;
  answerMissed: (id: string) => void;
}

export function useScanIdentify({
  loaded,
  identifyNow,
  unidentified,
  dismissUnidentified,
  onPick,
}: ScanIdentifyOptions): ScanIdentify {
  const [identify, setIdentify] = useState<{
    snapshot: string | null;
    pending: boolean;
    candidates: IdentifyCandidate[];
  } | null>(null);
  // Keyed so a sheet the user dismissed while it was still thinking cannot be
  // reopened by the answer arriving afterwards.
  const identifySeqRef = useRef(0);
  const [answeringId, setAnsweringId] = useState<string | null>(null);

  // Also how a second copy of a card still in hand gets counted: the engine
  // won't lock the same artwork twice on its own.
  async function identifyCard() {
    if (!loaded) {
      return;
    }
    const seq = ++identifySeqRef.current;
    setIdentify({ snapshot: null, pending: true, candidates: [] });
    const attempt = await identifyNow((snapshot) => {
      if (identifySeqRef.current === seq) {
        setIdentify((current) => (current === null ? null : { ...current, snapshot }));
      }
    });
    if (identifySeqRef.current !== seq) {
      return;
    }
    if (attempt.identified) {
      // Reported through onLock already; nothing left for this sheet to do.
      setIdentify(null);
      return;
    }
    setIdentify({
      snapshot: attempt.snapshot,
      pending: false,
      candidates: toIdentifyCandidates(loaded.labels, attempt.candidates),
    });
  }

  function run() {
    void identifyCard();
  }

  function dismiss() {
    identifySeqRef.current += 1;
    setIdentify(null);
    setAnsweringId(null);
  }

  function pick(candidate: IdentifyCandidate) {
    identifySeqRef.current += 1;
    setIdentify(null);
    if (answeringId !== null) {
      dismissUnidentified(answeringId);
      setAnsweringId(null);
    }
    onPick(candidate);
  }

  function answerMissed(id: string) {
    const card = unidentified.find((entry) => entry.id === id);
    if (!card || !loaded) {
      return;
    }
    if (card.candidates.length === 0) {
      toast.info("Nothing recognisable in that frame, scan the card again");
      dismissUnidentified(id);
      return;
    }
    identifySeqRef.current += 1;
    setAnsweringId(id);
    setIdentify({
      snapshot: card.thumbnail,
      pending: false,
      candidates: toIdentifyCandidates(loaded.labels, card.candidates),
    });
  }

  return {
    open: identify !== null,
    snapshot: identify?.snapshot ?? null,
    pending: identify?.pending ?? false,
    candidates: identify?.candidates ?? [],
    run,
    dismiss,
    pick,
    answerMissed,
  };
}
