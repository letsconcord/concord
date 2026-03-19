/**
 * Sound effects — synthesized via Web Audio API.
 * No external audio files required.
 *
 * The AudioContext is kept alive across window focus changes so that
 * notification sounds play even when the window is inactive.
 */

let audioCtx: AudioContext | null = null;

function getOrCreateContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Ensure the AudioContext is running. Must be awaited before scheduling
 * oscillators — a suspended context silently drops them.
 */
async function ensureContext(): Promise<AudioContext> {
  const ctx = getOrCreateContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}

/**
 * Synchronous version for user-initiated sounds (join/leave) where the
 * context is guaranteed to be running due to the user gesture.
 */
function getAudioContext(): AudioContext {
  const ctx = getOrCreateContext();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  return ctx;
}

// Keep the AudioContext alive when the window regains visibility,
// so background notifications don't need to wait for resume.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
});

/**
 * Two-tone ascending chime — played when joining a voice channel.
 * Quick, bright, and satisfying.
 */
export function playJoinSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First tone — lower
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone — higher, slight delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.08); // D6
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.15, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch {
    // Silently ignore — audio isn't critical
  }
}

/**
 * Two-tone descending chime — played when leaving a voice channel.
 * Quick, soft, unmistakable.
 */
export function playLeaveSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // First tone — higher
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(1174.66, now); // D6
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone — lower, slight delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.08); // A5
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.12, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.25);
  } catch {
    // Silently ignore
  }
}

/**
 * Three-tone ascending notification — "buh da ding".
 * Async so it properly resumes a suspended AudioContext before scheduling,
 * which is critical when the window is unfocused/minimized.
 */
export async function playNotificationSound(): Promise<void> {
  try {
    const ctx = await ensureContext();
    const now = ctx.currentTime;

    // "buh" — low, muted
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.1, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // "da" — mid
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659.25, now + 0.09); // E5
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.12, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.17);

    // "ding" — bright, lingers
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(783.99, now + 0.18); // G5
    gain3.gain.setValueAtTime(0, now);
    gain3.gain.setValueAtTime(0.15, now + 0.18);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc3.connect(gain3).connect(ctx.destination);
    osc3.start(now + 0.18);
    osc3.stop(now + 0.38);
  } catch {
    // Silently ignore
  }
}
