// Vibration feedback lives in the scanner hook (fires for the admin harness
// too); this tick is the scanning page's own, behind its mute preference.

let audioContext: AudioContext | null = null;

// Audio is best-effort: a blocked AudioContext must never break the add flow.
export function playLockTick(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.setValueAtTime(990, now + 0.06);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch {
    // No audio (autoplay policy, missing hardware): vibration and the tray
    // row still cover it.
  }
}
