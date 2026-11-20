// Timers: een reeks blokken (bv. 30 s stevig / 90 s rustig) die na elkaar aflopen.
// Pure rekenwerk; de UI tikt enkel de verstreken tijd door.

export interface TimerBlock {
  label: string;
  seconds: number;
  /** Stevig blok (andere kleur en een hoger piepje bij de start). */
  hard?: boolean;
}

export const totalSeconds = (blocks: TimerBlock[]) => blocks.reduce((n, b) => n + b.seconds, 0);

/** Waar zit je na `elapsed` seconden? `index === blocks.length` = klaar. */
export function blockAt(blocks: TimerBlock[], elapsed: number): { index: number; left: number; start: number } {
  let t = 0;
  for (let i = 0; i < blocks.length; i++) {
    const end = t + blocks[i]!.seconds;
    if (elapsed < end) return { index: i, left: end - elapsed, start: t };
    t = end;
  }
  return { index: blocks.length, left: 0, start: t };
}

/** Start (in seconden vanaf het begin) van blok `index`. */
export const blockStart = (blocks: TimerBlock[], index: number) => totalSeconds(blocks.slice(0, index));

/** Wissels die nog komen, in seconden vanaf nu (voor de piepjes). */
export function upcomingSwitches(blocks: TimerBlock[], elapsed: number): { in: number; hard: boolean }[] {
  const out: { in: number; hard: boolean }[] = [];
  let t = 0;
  for (let i = 0; i < blocks.length; i++) {
    t += blocks[i]!.seconds;
    if (t > elapsed) out.push({ in: t - elapsed, hard: !!blocks[i + 1]?.hard });
  }
  return out;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 30 → "30 s", 90 → "1:30 min", 300 → "5 min". */
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return seconds % 60 ? `${clock(seconds)} min` : `${seconds / 60} min`;
}

/** n× (stevig / rustig). */
export function intervals(n: number, hardSec: number, easySec: number, hardLabel = 'Stevig', easyLabel = 'Rustig'): TimerBlock[] {
  return Array.from({ length: n }, (_, i) => [
    { label: `${hardLabel} (${i + 1}/${n})`, seconds: hardSec, hard: true },
    { label: easyLabel, seconds: easySec },
  ]).flat();
}

/** Aftellen voor een oefening op tijd: 5 s om je klaar te zetten, per kant met 5 s om te wisselen. */
export function holdBlocks(seconds: number, perSide: boolean): TimerBlock[] {
  const ready = { label: 'Klaar zetten', seconds: 5 };
  return perSide
    ? [ready, { label: 'Eerste kant', seconds, hard: true }, { label: 'Wissel van kant', seconds: 5 }, { label: 'Andere kant', seconds, hard: true }]
    : [ready, { label: 'Hou vol', seconds, hard: true }];
}
