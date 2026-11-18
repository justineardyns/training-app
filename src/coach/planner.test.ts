import { describe, expect, it } from 'vitest';
import { addDays, dayIndex, weekDays } from './dates.ts';
import { DEFAULT_PREFS, planWeek, type PlanInput } from './planner.ts';
import { MAX_PER_WEEK, sanitizeAdjustments, validateWeek } from './rules.ts';
import type { DayAvailability, Location, Minutes, SessionLog } from './types.ts';

const MON = '2026-11-23';
const days = weekDays(MON);

function avail(spec: string, loc: Location = 'gym', min: Minutes = 45): DayAvailability[] {
  // spec: 7 tekens, 'x' = beschikbaar, '.' = niet
  return days.map((date, i) => ({ date, available: spec[i] === 'x', location: loc, minutes: min }));
}
function done(date: string, kind: SessionLog['kind'] = 'strength', template?: 'A' | 'B'): SessionLog {
  return { id: `${date}-${kind}`, date, kind, template, source: kind === 'strength' ? 'app' : 'watch', exercises: [], location: 'gym' };
}
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  monday: MON, today: MON, availability: avail('xxxxxxx'), history: [], prefs: DEFAULT_PREFS, ...over,
});
const sweatDates = (p: ReturnType<typeof planWeek>) => p.days.filter((d) => d.sweat).map((d) => d.date);
const short = (p: ReturnType<typeof planWeek>) => p.days.map((d) => (d.type === 'strength' ? d.template : d.type === 'cardio' ? 'C' : '.')).join('');

describe('weekplanning', () => {
  it('volle week: ma/wo/vr, 2× kracht + 1× conditie, nooit zondag', () => {
    const p = planWeek(base());
    expect(sweatDates(p)).toEqual([days[0], days[2], days[4]]);
    expect(short(p)).toBe('A.B.C..');
    expect(p.violations).toEqual([]);
  });

  it('wisselt A/B over de weken heen', () => {
    const p = planWeek(base({ history: [done(addDays(MON, -3), 'strength', 'A')] }));
    expect(p.days.find((d) => d.type === 'strength')!.template).toBe('B');
  });

  it('zondag → maandag: na een zweetsessie op zondag nooit op maandag', () => {
    const p = planWeek(base({ history: [done(addDays(MON, -1), 'class')] }));
    expect(p.days[0]!.sweat).toBe(false);
    expect(p.violations).toEqual([]);
  });

  it('geplande zondag van deze week blokkeert maandag van volgende week', () => {
    const next = addDays(MON, 7);
    const p = planWeek({ ...base(), monday: next, today: addDays(MON, 6), availability: weekDays(next).map((date) => ({ date, available: true, location: 'gym', minutes: 45 })), reservedSweat: [addDays(MON, 6)] });
    expect(p.days[0]!.sweat).toBe(false);
  });

  it('nooit twee dagen na elkaar, ook niet als enkel aaneengesloten dagen kunnen', () => {
    const p = planWeek(base({ availability: avail('xxx....') }));
    expect(sweatDates(p)).toEqual([days[0], days[2]]);
    expect(p.messages.join(' ')).toMatch(/passen maar 2 van de 3/);
  });

  it('maximaal 4 per week, ook met een gevraagd doel van 5', () => {
    const { adjustments } = sanitizeAdjustments({ targetSessions: 5 });
    const p = planWeek(base({ adjustments }));
    expect(p.target).toBe(MAX_PER_WEEK);
    expect(sweatDates(p).length).toBeLessThanOrEqual(4);
  });

  it('een groepsles op je Watch telt mee en vervangt de conditiesessie', () => {
    const p = planWeek(base({ today: addDays(MON, 1), history: [done(MON, 'class')] }));
    expect(p.done).toBe(1);
    const planned = p.days.filter((d) => d.status === 'planned');
    expect(planned).toHaveLength(2);
    expect(planned.every((d) => d.type === 'strength')).toBe(true);
    expect(planned[0]!.date).not.toBe(addDays(MON, 1)); // dinsdag kan niet na maandag
  });

  it('gemiste training: geen inhaalrace, geen stapeling', () => {
    // Plan was ma/wo/vr; ma gemist, het is nu dinsdag.
    const p = planWeek(base({ today: addDays(MON, 1), originalPlan: [days[0]!, days[2]!, days[4]!] }));
    expect(p.days[0]!.status).toBe('missed');
    const s = sweatDates(p);
    for (let i = 1; i < s.length; i++) expect(addDays(s[i - 1]!, 1)).not.toBe(s[i]);
    expect(p.messages.join(' ')).toMatch(/Geen inhaalrace/);
    expect(p.violations).toEqual([]);
  });

  it('gemist op donderdag: er blijft hoogstens wat binnen de regels past', () => {
    const p = planWeek(base({ today: addDays(MON, 3), history: [done(MON, 'strength', 'A')], originalPlan: [days[0]!, days[2]!, days[4]!] }));
    expect(p.done).toBe(1);
    expect(p.days[2]!.status).toBe('missed');
    // do/za of do/zo of vr/zo … maar nooit twee na elkaar
    expect(p.planned).toBe(2);
    expect(p.violations).toEqual([]);
  });

  it('rood vandaag: sessie verplaatst, vandaag mobiliteit', () => {
    const p = planWeek(base({ readinessToday: 'red', originalPlan: [days[0]!, days[2]!, days[4]!] }));
    expect(p.days[0]!.status).toBe('moved');
    expect(p.days[0]!.light?.id).toBe('mobiliteit');
    expect(p.days[0]!.sweat).toBe(false);
    expect(p.messages.join(' ')).toMatch(/Rood vandaag/);
    expect(p.violations).toEqual([]);
  });

  it('oranje vandaag: lichtere versie, zelfde dag', () => {
    const p = planWeek(base({ readinessToday: 'orange' }));
    expect(p.days[0]!.sweat).toBe(true);
    expect(p.days[0]!.lighter).toBe(true);
  });

  it('thuis i.p.v. Jims en minder tijd worden overgenomen', () => {
    const a = avail('x.x....');
    a[0] = { ...a[0]!, location: 'home', minutes: 30 };
    const p = planWeek(base({ availability: a }));
    expect(p.days[0]).toMatchObject({ type: 'strength', location: 'home', minutes: 30 });
    expect(p.days[0]!.title).toMatch(/thuis · 30 min/);
    expect(p.days[2]).toMatchObject({ type: 'strength', location: 'gym', minutes: 45 });
  });

  it('eerst kracht, conditie later in de week (ook als je van locatie wisselt)', () => {
    const a = avail('x.x.x..');
    a[0] = { ...a[0]!, location: 'home', minutes: 30 };
    const p = planWeek(base({ availability: a }));
    expect(p.days[0]!.type).toBe('strength');
    expect(p.days[2]!.type).toBe('strength');
    expect(p.days[4]!.type).toBe('cardio');
  });

  it('stabiel: een al geplande dag blijft gepland bij een kleine wijziging', () => {
    const a = avail('xxxxxxx');
    a[0] = { ...a[0]!, location: 'home', minutes: 30 };
    const p = planWeek(base({ availability: a, originalPlan: [days[0]!, days[2]!, days[4]!] }));
    expect(sweatDates(p)).toEqual([days[0], days[2], days[4]]);
  });

  it('weekdoel gehaald → rest van de week zweetvrij', () => {
    const p = planWeek(base({ today: addDays(MON, 5), history: [done(MON, 'strength', 'A'), done(days[2]!, 'strength', 'B'), done(days[4]!, 'class')] }));
    expect(p.planned).toBe(0);
    expect(p.days[5]!.type).toBe('light');
    expect(p.messages.join(' ')).toMatch(/Weekdoel gehaald/);
  });

  it('tussendagen krijgen een zweetvrije suggestie, na kracht mobiliteit', () => {
    const p = planWeek(base());
    expect(p.days[1]!.light?.id).toBe('mobiliteit');
    expect(p.days.filter((d) => !d.sweat).every((d) => d.light)).toBe(true);
  });

  it('geen beschikbaarheid ingevuld → standaard + melding', () => {
    const p = planWeek(base({ availability: undefined }));
    expect(p.usedDefaultAvailability).toBe(true);
    expect(p.messages[0]).toMatch(/beschikbaarheid/);
  });

  it('3e sessie kracht als je dat verkiest', () => {
    const p = planWeek(base({ prefs: { ...DEFAULT_PREFS, thirdSession: 'strength' } }));
    expect(short(p)).toBe('A.B.A..');
  });

  it('bijsturing van /coach geldt pas vanaf validFrom', () => {
    const later = planWeek(base({ adjustments: { version: 1, targetSessions: 2, validFrom: addDays(MON, 7) } }));
    expect(later.target).toBe(3);
    const now = planWeek(base({ adjustments: { version: 1, targetSessions: 2, validFrom: MON, focus: 'Focus op slaap.' } }));
    expect(now.target).toBe(2);
    expect(now.messages.join(' ')).toMatch(/Coach: Focus op slaap/);
  });
});

describe('harde regels (fuzz)', () => {
  // Deterministische pseudo-random generator.
  let seed = 42;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;

  it('breekt in 3000 willekeurige weken nooit een regel', () => {
    for (let n = 0; n < 3000; n++) {
      const availability = days.map((date) => ({
        date,
        available: rnd() < 0.6,
        location: pick(['gym', 'home'] as const),
        minutes: pick([30, 45, 60] as const),
      }));
      const today = addDays(MON, Math.floor(rnd() * 8) - 1);
      const history: SessionLog[] = [];
      if (rnd() < 0.4) history.push(done(addDays(MON, -1), pick(['strength', 'class', 'cardio'] as const), 'A'));
      for (const d of days.filter((x) => x < today)) {
        if (rnd() < 0.3 && !history.some((h) => h.date === addDays(d, -1))) history.push(done(d, pick(['strength', 'class'] as const), pick(['A', 'B'] as const)));
      }
      const p = planWeek({
        monday: MON, today, availability, history,
        prefs: { ...DEFAULT_PREFS, targetPerWeek: pick([2, 3, 4]), thirdSession: pick(['cardio', 'strength'] as const) },
        readinessToday: pick(['green', 'orange', 'red', undefined] as const),
      });
      expect(p.violations, JSON.stringify({ availability, today, history })).toEqual([]);
      const sessions = p.days.filter((d) => d.sweat);
      expect(sessions.length).toBeLessThanOrEqual(MAX_PER_WEEK);
      for (const d of p.days.filter((x) => x.status === 'planned')) {
        expect(availability[dayIndex(d.date)]!.available).toBe(true);
        expect(d.date >= today).toBe(true);
      }
      // Onafhankelijke hercontrole van "nooit twee dagen na elkaar" voor geplande dagen.
      const all = [...history.map((h) => h.date), ...p.days.filter((d) => d.status === 'planned').map((d) => d.date)].sort();
      for (const d of p.days.filter((x) => x.status === 'planned')) {
        expect(all).not.toContain(addDays(d.date, -1));
        expect(all).not.toContain(addDays(d.date, 1));
      }
    }
  });
});

describe('validateWeek', () => {
  it('detecteert alle regelbreuken', () => {
    const v = validateWeek({
      monday: MON,
      sessions: [MON, days[1]!, days[3]!, days[5]!, days[6]!].map((date) => ({ date, planned: true })),
      neighbors: [],
      availability: avail('xxxxxx.'),
    });
    const rules = v.map((x) => x.rule);
    expect(rules).toContain('max_per_week');
    expect(rules).toContain('consecutive');
    expect(rules).toContain('unavailable');
  });

  it('zondag vorige week + maandag gepland = overtreding', () => {
    const v = validateWeek({ monday: MON, sessions: [{ date: MON, planned: true }], neighbors: [addDays(MON, -1)] });
    expect(v.map((x) => x.rule)).toEqual(['consecutive']);
  });
});

describe('sanitizeAdjustments', () => {
  it('laat enkel geldige, veilige bijsturing door', () => {
    const { adjustments, errors } = sanitizeAdjustments({
      targetSessions: 9,
      forceDeload: true,
      swaps: [
        { from: 'leg-press', to: 'goblet-squat' },
        { from: 'leg-press', to: 'db-curl' },
        { from: 'bestaat-niet', to: 'goblet-squat' },
      ],
      repRangeOverrides: { 'db-bench': [6, 10], 'leg-press': [12, 8] },
    });
    expect(adjustments.targetSessions).toBe(4);
    expect(adjustments.swaps).toEqual([{ from: 'leg-press', to: 'goblet-squat', reason: undefined }]);
    expect(adjustments.repRangeOverrides).toEqual({ 'db-bench': [6, 10] });
    expect(errors.length).toBe(4);
  });
});
