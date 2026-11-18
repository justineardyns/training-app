// Piep aan het einde van de rust. iOS laat audio pas toe na een tik, dus we "ontgrendelen"
// de AudioContext bij elke ✓ en plannen de piep vooruit (werkt ook als timers vertragen).

let ctx: AudioContext | undefined;
let scheduled: OscillatorNode[] = [];

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

export function cancelBeep() {
  for (const o of scheduled) {
    try {
      o.stop();
    } catch {
      /* al gestopt */
    }
  }
  scheduled = [];
}

/** Twee korte piepjes over `seconds` seconden. */
export function scheduleBeep(seconds: number) {
  cancelBeep();
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + Math.max(0, seconds);
  for (const offset of [0, 0.25]) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.18);
    osc.connect(gain).connect(a.destination);
    osc.start(t0 + offset);
    osc.stop(t0 + offset + 0.2);
    scheduled.push(osc);
  }
}
