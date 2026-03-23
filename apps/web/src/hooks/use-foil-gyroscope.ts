import { useSyncExternalStore } from "react";

type PermissionState = "prompt" | "granted" | "denied" | "unknown";

export interface GyroState {
  available: boolean;
  permissionState: PermissionState;
  beta: number;
  gamma: number;
}

let state: GyroState = {
  available: false,
  permissionState: "unknown",
  beta: 0,
  gamma: 0,
};

const listeners = new Set<() => void>();
let listening = false;
let rafId = 0;
let pendingBeta = 0;
let pendingGamma = 0;
let hasPending = false;

function notify() {
  for (const cb of listeners) {
    cb(); // oxlint-disable-line promise/prefer-await-to-callbacks -- useSyncExternalStore subscriber callbacks
  }
}

function handleOrientation(e: DeviceOrientationEvent) {
  pendingBeta = e.beta ?? 0;
  pendingGamma = e.gamma ?? 0;
  if (!hasPending) {
    hasPending = true;
    rafId = requestAnimationFrame(() => {
      hasPending = false;
      state = { ...state, beta: pendingBeta, gamma: pendingGamma };
      notify();
    });
  }
}

function startListening() {
  if (listening) {
    return;
  }
  listening = true;
  state = { ...state, available: true, permissionState: "granted" };
  notify();
  globalThis.addEventListener("deviceorientation", handleOrientation, { passive: true });
}

function stopListening() {
  if (!listening) {
    return;
  }
  listening = false;
  globalThis.removeEventListener("deviceorientation", handleOrientation);
  cancelAnimationFrame(rafId);
  hasPending = false;
}

// Only enable on devices likely to have a gyroscope (touch-capable).
// This avoids a "use of the orientation sensor is deprecated" console warning
// on desktop Chromium where the sensor is unusable anyway.
// Guarded for SSR — navigator / DeviceOrientationEvent don't exist on the server.
if (typeof globalThis !== "undefined" && typeof navigator !== "undefined") {
  const hasTouch = "ontouchstart" in globalThis || navigator.maxTouchPoints > 0;

  if (hasTouch && typeof DeviceOrientationEvent !== "undefined") {
    // iOS 13+ requires explicit permission; non-iOS: assume granted
    state = {
      ...state,
      available: true,
      permissionState:
        "requestPermission" in DeviceOrientationEvent &&
        typeof (DeviceOrientationEvent as unknown as { requestPermission: unknown })
          .requestPermission === "function"
          ? "prompt"
          : "granted",
    };
  }
}

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- required by useSyncExternalStore API
function subscribe(callback: () => void) {
  listeners.add(callback);
  if (listeners.size === 1 && state.permissionState === "granted") {
    startListening();
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) {
      stopListening();
    }
  };
}

function getSnapshot(): GyroState {
  return state;
}

function getServerSnapshot(): GyroState {
  return { available: false, permissionState: "unknown", beta: 0, gamma: 0 };
}

export function useFoilGyroscope() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
