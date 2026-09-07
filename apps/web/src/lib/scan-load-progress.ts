export interface ResourceProgress {
  loaded: number;
  total: number;
  ready: boolean;
}

export interface EngineProgress {
  opencv: ResourceProgress;
  encoder: ResourceProgress;
}

type ScanLoadPhase = "downloading" | "starting";

export interface ScanLoadProgress {
  percent: number;
  phase: ScanLoadPhase;
}

function fraction(resource: ResourceProgress): number {
  if (resource.ready) {
    return 1;
  }
  if (resource.total <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, resource.loaded / resource.total));
}

function downloaded(resource: ResourceProgress): boolean {
  return resource.ready || (resource.total > 0 && resource.loaded >= resource.total);
}

export function scanLoadProgress(bankLoaded: boolean, engine: EngineProgress): ScanLoadProgress {
  const parts = [bankLoaded ? 1 : 0, fraction(engine.opencv), fraction(engine.encoder)];
  const percent = Math.round((100 * parts.reduce((sum, part) => sum + part, 0)) / parts.length);
  const phase =
    bankLoaded && downloaded(engine.opencv) && downloaded(engine.encoder)
      ? "starting"
      : "downloading";
  return { percent, phase };
}
