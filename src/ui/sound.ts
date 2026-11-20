// Piepjes voor de timers. iOS laat audio pas toe na een tik, dus we "ontgrendelen" de AudioContext
// bij elke tik en plannen de piepjes vooruit (werkt ook als JavaScript-timers vertragen).

let ctx: AudioContext | undefined;
let scheduled: { osc: OscillatorNode; at: number }[] = [];

function audio(): AudioContext | undefined {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return undefined;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
}

/** Geplande piepjes schrappen (een piepje dat al klinkt, mag uitklinken). */
export function cancelBeep() {
  const now = ctx?.currentTime ?? 0;
  for (const { osc, at } of scheduled) {
    if (at <= now) continue;
    try {
      osc.stop();
    } catch {
      /* al gestopt */
    }
  }
  scheduled = scheduled.filter((x) => x.at <= now);
}

function beep(a: AudioContext, t0: number, high: boolean) {
  // Laag: 2 korte piepjes (rust/klaar). Hoog: 3 piepjes (stevig, gaan!).
  for (const offset of high ? [0, 0.2, 0.4] : [0, 0.25]) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.frequency.value = high ? 1175 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.16);
    osc.connect(gain).connect(a.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.18);
    scheduled.push({ osc, at: t0 + offset });
  }
}

/** Twee korte piepjes over `seconds` seconden (vervangt wat gepland stond). */
export function scheduleBeep(seconds: number) {
  scheduleBeeps([{ in: seconds, hard: false }]);
}

/** Meerdere piepjes tegelijk plannen, bv. elke wissel van een intervaltimer. */
export function scheduleBeeps(list: { in: number; hard: boolean }[]) {
  cancelBeep();
  const a = audio();
  if (!a) return;
  for (const b of list) beep(a, a.currentTime + Math.max(0, b.in), b.hard);
}

/** Korte trilling, als het toestel dat kan (iPhone: niet in Safari). */
export function buzz() {
  try {
    navigator.vibrate?.(200);
  } catch {
    /* geen trilling */
  }
}
