/**
 * The lock tick: a short confirmation sound so bulk scanning works with the
 * eyes on the physical pile, not the screen. The vibration half of the
 * feedback lives in the scanner hook (it fires for the admin harness too);
 * the tick is the scanning page's, behind its mute preference.
 */

let audioContext: AudioContext | null = null;

/**
 * Play the lock tick. Safe to call from any user-gesture-adjacent context;
 * audio is best-effort and failures are swallowed (a blocked AudioContext
 * must never break the add flow).
 *
 * @returns Nothing; the sound plays asynchronously.
 */
export function playLockTick(): void {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    // A quick upward two-tone reads as "accepted" without being loud; the
    // exponential fade keeps it click-free.
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
    // No audio (autoplay policy, missing hardware) — the vibration and the
    // tray row are still there.
  }
}
