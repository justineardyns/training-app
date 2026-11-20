import { useEffect, useRef, useState } from 'preact/hooks';
import { blockAt, blockStart, clock, duration, holdBlocks, totalSeconds, upcomingSwitches, type TimerBlock } from '../coach/timer.ts';
import { useNow, useWakeLock } from './hooks.ts';
import { buzz, cancelBeep, scheduleBeeps } from './sound.ts';

// Aflopende timer per blok (bv. roeien: 30 s stevig / 90 s rustig). Loopt zelf door naar het volgende blok,
// met piepjes bij elke wissel (hoog = stevig, laag = rustig/klaar). Blijft lopen als je even van scherm wisselt.

interface Run {
  blocks: TimerBlock[];
  /** Verstreken ms op het moment van (her)starten. */
  base: number;
  since: number;
  paused: boolean;
}
const runs = new Map<string, Run>();

const elapsedMs = (r: Run) => r.base + (r.paused ? 0 : Math.max(0, Date.now() - r.since));

export function IntervalTimer(props: { id: string; blocks: TimerBlock[]; steps?: string[]; doneText?: string }) {
  const [run, setRunState] = useState<Run | undefined>(() => runs.get(props.id));
  const setRun = (r?: Run) => {
    if (r) runs.set(props.id, r);
    else runs.delete(props.id);
    setRunState(r);
  };
  useNow(250, !!run && !run.paused);
  const blocks = run?.blocks ?? props.blocks;
  const total = totalSeconds(blocks);
  const elapsed = run ? elapsedMs(run) / 1000 : 0;
  const pos = blockAt(blocks, elapsed);
  const done = !!run && pos.index >= blocks.length;
  useWakeLock(!!run && !run.paused && !done);

  // Trillen bij elke wissel (de piepjes staan al vooruit gepland).
  const last = useRef(pos.index);
  useEffect(() => {
    if (pos.index !== last.current) {
      last.current = pos.index;
      if (run) buzz();
    }
  }, [pos.index]);

  const start = () => {
    last.current = 0;
    setRun({ blocks: props.blocks, base: 0, since: Date.now(), paused: false });
    scheduleBeeps(upcomingSwitches(props.blocks, 0));
  };
  const pause = () => {
    cancelBeep();
    setRun({ ...run!, base: elapsedMs(run!), paused: true });
  };
  const resume = () => {
    setRun({ ...run!, since: Date.now(), paused: false });
    scheduleBeeps(upcomingSwitches(blocks, elapsed));
  };
  const skip = () => {
    const to = blockStart(blocks, pos.index + 1);
    setRun({ ...run!, base: to * 1000, since: Date.now() });
    if (run!.paused) cancelBeep();
    else scheduleBeeps(upcomingSwitches(blocks, to));
  };
  const stop = () => {
    cancelBeep();
    setRun(undefined);
  };

  if (!run) {
    return (
      <div class="itimer idle">
        {props.steps && (
          <ul class="steps">
            {props.steps.map((st) => (
              <li key={st}>{st}</li>
            ))}
          </ul>
        )}
        <button class="btn primary" onClick={start}>
          ▶ Start timer · {duration(total)}
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div class="itimer done" role="status">
        <p class="itimer-label">✓ Klaar! {duration(total)} gedaan.</p>
        {props.doneText && <p class="muted small">{props.doneText}</p>}
        <button class="btn ghost small" onClick={stop}>
          Timer sluiten
        </button>
      </div>
    );
  }

  const cur = blocks[pos.index]!;
  const next = blocks[pos.index + 1];
  const pct = Math.min(100, (1 - pos.left / cur.seconds) * 100);
  return (
    <div class={`itimer ${cur.hard ? 'hard' : 'easy'} ${run.paused ? 'paused' : ''}`} role="timer" aria-live="polite">
      <p class="muted small row-between">
        <span>
          Blok {pos.index + 1}/{blocks.length}
        </span>
        <span>nog {clock(total - elapsed)} in totaal</span>
      </p>
      <p class="itimer-label">{cur.label}</p>
      <p class="itimer-time">{clock(Math.ceil(pos.left))}</p>
      <div class="itimer-bar" aria-hidden="true">
        <div class="itimer-fill" style={{ width: `${pct}%` }} />
      </div>
      <p class="muted small">{next ? `Hierna: ${next.label.toLowerCase()}, ${duration(next.seconds)}` : 'Laatste blok'}</p>
      <div class="row">
        <button class="btn" onClick={run.paused ? resume : pause}>
          {run.paused ? '▶ Verder' : '⏸ Pauze'}
        </button>
        <button class="btn" onClick={skip}>
          ⏭ Volgende
        </button>
      </div>
      <button class="btn ghost small itimer-stop" onClick={stop}>
        Stop timer
      </button>
    </div>
  );
}

/** Aftellen voor één set van een oefening op tijd (plank, zijplank…). Vinkt de set zelf af. */
export function HoldTimer(props: { seconds: number; perSide: boolean; onDone: () => void; onCancel: () => void }) {
  const [since] = useState(() => Date.now());
  const [blocks] = useState(() => holdBlocks(props.seconds, props.perSide));
  useNow(250);
  const pos = blockAt(blocks, (Date.now() - since) / 1000);
  useEffect(() => {
    scheduleBeeps(upcomingSwitches(blocks, 0));
  }, []);
  const last = useRef(0);
  useEffect(() => {
    if (pos.index === last.current) return;
    last.current = pos.index;
    buzz();
    if (pos.index >= blocks.length) props.onDone();
  }, [pos.index]);
  const cur = blocks[pos.index];
  return (
    <div class={`hold ${cur?.hard ? 'hard' : ''}`} role="timer" aria-live="polite">
      <span class="hold-time">{clock(Math.ceil(pos.left))}</span>
      <span class="hold-label">{cur?.label.toLowerCase()}</span>
      <button
        class="btn small ghost"
        aria-label="Timer stoppen"
        onClick={() => {
          cancelBeep();
          props.onCancel();
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Oplopende klok: hoelang je al bezig bent. */
export function Elapsed(props: { since: string }) {
  useNow(1000);
  const sec = (Date.now() - new Date(props.since).getTime()) / 1000;
  return (
    <span class="elapsed" role="timer" aria-label={`Trainingstijd ${clock(sec)}`}>
      ⏱ {clock(sec)}
    </span>
  );
}
