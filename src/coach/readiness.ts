import type { Energy, HealthDay, ReadinessLevel } from './types.ts';

// Dagvorm: slaap, HRV en rusthartslag t.o.v. JOUW gemiddelde (laatste 28 dagen) + één tik energie.

export const BASELINE_DAYS = 28;
export const MIN_BASELINE = 7;

export interface Stats {
  mean: number;
  sd: number;
  n: number;
}

export function stats(values: (number | undefined)[]): Stats {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const n = v.length;
  if (n === 0) return { mean: NaN, sd: NaN, n: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

export interface ReadinessInput {
  today?: HealthDay;
  /** Vorige dagen (zonder vandaag); de laatste 28 worden gebruikt. */
  history: HealthDay[];
  energy?: Energy;
}

export interface ReadinessResult {
  level: ReadinessLevel;
  score: number;
  reasons: string[];
  advice: string;
  /** Basislijn nog in opbouw (minder dan 7 dagen). */
  learning: boolean;
  baselineDays: number;
}

const fmt1 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 1 });

function hoursText(h: number): string {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min === 0 ? `${whole}u` : `${whole}u${String(min).padStart(2, '0')}`;
}

export function assessReadiness(input: ReadinessInput): ReadinessResult {
  const recent = [...input.history]
    .filter((d) => !input.today || d.date < input.today.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-BASELINE_DAYS);
  const hrv = stats(recent.map((d) => d.hrvMs));
  const rhr = stats(recent.map((d) => d.restingHr));
  const sleep = stats(recent.map((d) => d.sleepHours));
  const t = input.today;
  const reasons: string[] = [];
  let score = 0;
  const baselineDays = Math.min(hrv.n, rhr.n);
  const learning = baselineDays < MIN_BASELINE;

  // HRV: lager dan normaal = minder hersteld.
  if (t?.hrvMs !== undefined && hrv.n >= MIN_BASELINE) {
    const sd = Math.max(hrv.sd, hrv.mean * 0.05);
    const z = (t.hrvMs - hrv.mean) / sd;
    if (z <= -1.5) {
      score -= 2;
      reasons.push(`HRV duidelijk lager dan normaal (${Math.round(t.hrvMs)} vs ${Math.round(hrv.mean)} ms)`);
    } else if (z <= -0.75) {
      score -= 1;
      reasons.push(`HRV wat lager dan normaal (${Math.round(t.hrvMs)} vs ${Math.round(hrv.mean)} ms)`);
    }
  }

  // Rusthartslag: hoger dan normaal = vermoeidheid, stress of iets onder de leden.
  if (t?.restingHr !== undefined && rhr.n >= MIN_BASELINE) {
    const diff = t.restingHr - rhr.mean;
    const z = diff / Math.max(rhr.sd, 1.5);
    if (z >= 1.5 || diff >= 7) {
      score -= 2;
      reasons.push(`Rusthartslag ${Math.round(diff)} slagen hoger dan normaal`);
    } else if (z >= 0.75 || diff >= 4) {
      score -= 1;
      reasons.push(`Rusthartslag iets hoger (+${Math.round(diff)})`);
    }
  }

  // Slaap: absoluut én t.o.v. je gewoonte.
  if (t?.sleepHours !== undefined) {
    let s = 0;
    if (t.sleepHours < 5) s = -2;
    else if (t.sleepHours < 6) s = -1;
    if (s === 0 && sleep.n >= MIN_BASELINE && t.sleepHours < sleep.mean - 1.25) s = -1;
    if (s < 0) {
      score += s;
      reasons.push(
        sleep.n >= MIN_BASELINE
          ? `Kort geslapen: ${hoursText(t.sleepHours)} (normaal ${hoursText(sleep.mean)})`
          : `Kort geslapen: ${hoursText(t.sleepHours)}`,
      );
    }
  }

  if (input.energy === 'low') {
    score -= 2;
    reasons.push('Je energie is laag');
  } else if (input.energy === 'high') {
    score += 1;
  }

  if (!t || (t.hrvMs === undefined && t.restingHr === undefined && t.sleepHours === undefined)) {
    reasons.push('Geen Watch-data van vannacht: enkel je energie telt');
  } else if (learning) {
    reasons.push(`Je basislijn wordt nog opgebouwd (${baselineDays}/${MIN_BASELINE} dagen)`);
  }

  const level: ReadinessLevel = score >= -1 ? 'green' : score >= -3 ? 'orange' : 'red';
  return { level, score, reasons, advice: ADVICE[level], learning, baselineDays };
}

export const ADVICE: Record<ReadinessLevel, string> = {
  green: 'Groen: train zoals gepland. Ga ervoor.',
  orange: 'Oranje: je traint, maar lichter: 1 set minder per oefening en geen zwaarder gewicht. Intervallen worden rustige cardio.',
  red: 'Rood: vandaag geen zweettraining. We verplaatsen je sessie. Doe 15 min mobiliteit of een wandeling.',
};

export const LEVEL_LABEL: Record<ReadinessLevel, string> = { green: 'Groen', orange: 'Oranje', red: 'Rood' };

export { fmt1 };
