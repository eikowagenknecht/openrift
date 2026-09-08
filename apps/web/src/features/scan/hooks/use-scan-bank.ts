import { useEffect, useState } from "react";

import type { ScanServing } from "@/features/scan/hooks/use-scan-serving";
import { useScanServing } from "@/features/scan/hooks/use-scan-serving";
import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import { loadScanBank } from "@/features/scan/lib/scan-bank";

interface ScanBank {
  assets: ScanServing["assets"];
  loaded: LoadedScanBank | null;
  unavailableMessage: string | null;
}

export function useScanBank(): ScanBank {
  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const serving = useScanServing();
  const assets = serving.assets;
  // assets is re-derived every render; depending on it directly would cancel the in-flight load.
  const bankUrl = assets?.bankUrl ?? null;
  const labelsUrl = assets?.labelsUrl ?? null;
  useEffect(() => {
    if (bankUrl === null || labelsUrl === null) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const result = await loadScanBank(bankUrl as string, labelsUrl as string);
        if (!cancelled) {
          setLoaded(result);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load the scan data");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bankUrl, labelsUrl]);

  // Actionable guidance for an unpublished bank lives on the admin scan page.
  const unavailableMessage =
    serving.status === "unavailable"
      ? "The card index has not been published yet. Please try again later."
      : loadError;

  return { assets, loaded, unavailableMessage };
}
