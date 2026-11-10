// A short two-note chime for incoming-message notifications, synthesised with
// Web Audio so the app ships no sound files. Browsers only allow audio after
// the user has interacted with the page, which signing in always does.

let ctx: AudioContext | null = null;

export function playChime() {
  try {
    ctx ??= new AudioContext();
    const start = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const t = start + i * 0.12;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    /* audio unavailable */
  }
}
