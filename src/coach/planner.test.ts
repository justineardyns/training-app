import { describe, expect, it } from 'vitest';
import { defaultDay, resolveDay } from './availability.ts';
import { addDays, dayIndex } from './dates.ts';
import { DEFAULT_PREFS, normalizePrefs, planWeek, type PlanInput, type WeekPlan } from './planner.ts';
import { MAX_PER_WEEK, sanitizeAdjustments, validateRolling } from './rules.ts';
import type { DayAvailability, SessionLog, Slot } from './types.ts';

const MON = '2026-11-23';
const D = (i: number) => addDays(MON, i);

function done(date: string, kind: SessionLog['kind'] = 'strength', template?: 'A' | 'B'): SessionLog {
  return { id: `${date}-${kind}`, date, kind, template, source: kind === 'strength' ? 'app' : 'watch', exercises: [], location: 'gym' };
}
/** Standaard: weekdagen 's avonds, weekend overdag, 45 min. */
const std = (date: string): DayAvailability => defaultDay(date, 45);

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  today: MON, availability: std, history: [], prefs: DEFAULT_PREFS, ...over,
});
const sweatDates = (p: WeekPlan) => p.days.filter((d) => d.sweat).map((d) => d.date);
const short = (p: WeekPlan) =>
  p.days.map((d) => (d.type === 'strength' ? d.template : d.type === 'cardio' ? (d.groupClass ? 'G' : 'C') : d.type === 'tennis' ? 'T' : '.')).join('');

describe('rollend plannen: 4 per 7 dagen, 2 kracht + 2 conditie', () => {
  it('alles beschikbaar: om de dag, kracht en indoor cycling afwisselend', () => {
    const p = planWeek(base());
    expect(sweatDates(p)).toEqual([D(0), D(2), D(4), D(6)]);
    // ma kracht A, wo cycling (wo-avond), vr kracht B, zo cycling (zo-ochtend)
    expect(short(p)).toBe('A.G.B.G');
    expect(p.days[2]!.title).toBe('Indoor cycling (groepsles) · Jims');
    expect(p.violations).toEqual([]);
  });

  it('het venster rolt mee: vanaf donderdag plannen loopt tot en met woensdag', () => {
    const p = planWeek(base({ today: D(3), history: [done(D(0), 'strength', 'A'), done(D(2), 'class')] }));
    expect(p.start).toBe(D(3));
    expect(p.days.at(-1)!.date).toBe(D(9));
    expect(p.days[0]!.sweat).toBe(false); // donderdag na woensdag: nee
    expect(p.violations).toEqual([]);
  });

  it('nooit meer dan 4 in eender welke 7 dagen, ook met wat je al deed', () => {
    const history = [done(D(-4), 'strength', 'A'), done(D(-2), 'class'), done(D(0), 'strength', 'B')];
    const p = planWeek(base({ today: D(1), history }));
    const all = [...history.map((h) => h.date), ...p.days.filter((d) => d.status === 'planned').map((d) => d.date)];
    for (let w = -10; w <= 10; w++) {
      const from = D(w);
      expect(all.filter((d) => d >= from && d <= addDays(from, 6)).length).toBeLessThanOrEqual(MAX_PER_WEEK);
    }
    expect(p.violations).toEqual([]);
  });

  it('enkel Jims: weekdagavond en weekend overdag; weekendavond kan niet (Jims sluit om 17u)', () => {
    expect(resolveDay({ date: D(5), slots: ['evening'], minutes: 45 }).available).toBe(false);
    expect(resolveDay({ date: D(1), slots: ['evening'], minutes: 45 })).toMatchObject({ location: 'gym', slot: 'evening' });
    expect(resolveDay({ date: D(6), slots: ['day', 'evening'], minutes: 45 })).toMatchObject({ location: 'gym', slot: 'day' });
    expect(resolveDay({ date: D(1), slots: ['evening'], minutes: 45, home: true })).toMatchObject({ location: 'gym' });
    // Met thuistraining aan (verborgen optie): weekendavond en "thuis" kunnen wel.
    expect(resolveDay({ date: D(5), slots: ['evening'], minutes: 45 }, true)).toMatchObject({ location: 'home', slot: 'evening' });
    expect(resolveDay({ date: D(1), slots: ['evening'], minutes: 45, home: true }, true)).toMatchObject({ location: 'home' });
    // Overdag op een weekdag kan je niet aanvinken.
    expect(resolveDay({ date: D(1), slots: ['day'], minutes: 45 }).available).toBe(false);
  });

  it('cycling enkel op lesmomenten; zaterdagavond wordt niet gepland (enkel Jims)', () => {
    const av = (date: string): DayAvailability => {
      if (date === D(5)) return { date, slots: ['evening'] as Slot[], minutes: 45 };
      return date === D(1) || date === D(3) ? std(date) : { date, slots: [], minutes: 45 };
    };
    const p = planWeek(base({ availability: av }));
    expect(p.days.filter((d) => d.type === 'cardio').every((d) => !d.groupClass)).toBe(true);
    expect(p.days[5]!.sweat).toBe(false);
    expect(p.days.filter((d) => d.sweat).every((d) => d.location === 'gym')).toBe(true);
    expect(p.violations).toEqual([]);
  });

  it('tennis op donderdag telt mee: geen training op woensdag of vrijdag, en 2× kracht blijft', () => {
    const p = planWeek(base({ availability: (d) => (d === D(3) ? { ...std(d), tennis: 120 } : std(d)) }));
    expect(p.days[3]).toMatchObject({ type: 'tennis', sweat: true, title: 'Tennis · 2u' });
    expect(p.days[2]!.sweat).toBe(false);
    expect(p.days[4]!.sweat).toBe(false);
    expect(p.days.filter((d) => d.type === 'strength')).toHaveLength(2);
    expect(p.messages.join(' ')).toMatch(/passen 3 van de 4/);
    expect(p.violations).toEqual([]);
  });

  it('thuis aangevinkt (enkel als thuistraining aan staat): kracht en conditie thuis, nooit een groepsles', () => {
    expect(planWeek(base({ availability: (d) => ({ ...std(d), home: true }) })).days.filter((d) => d.sweat).every((d) => d.location === 'gym')).toBe(true);
    const p = planWeek(base({ availability: (d) => ({ ...std(d), home: true }), prefs: { ...DEFAULT_PREFS, trainAtHome: true } }));
    expect(p.days.filter((d) => d.sweat).every((d) => d.location === 'home' && !d.groupClass)).toBe(true);
  });

  it('wisselt A/B over de vensters heen', () => {
    const p = planWeek(base({ today: D(2), history: [done(D(0), 'strength', 'A')] }));
    expect(p.days.find((d) => d.type === 'strength')!.template).toBe('B');
  });

  it('rood vandaag: verplaatst, vandaag mobiliteit; oranje: lichter', () => {
    const red = planWeek(base({ readinessToday: 'red', originalPlan: [D(0), D(2), D(4), D(6)] }));
    expect(red.days[0]).toMatchObject({ status: 'moved', sweat: false });
    expect(red.messages.join(' ')).toMatch(/Rood vandaag/);
    expect(red.violations).toEqual([]);
    const orange = planWeek(base({ readinessToday: 'orange' }));
    expect(orange.days[0]).toMatchObject({ sweat: true, lighter: true });
  });

  it('gemist: geen inhaalrace, geen stapeling', () => {
    const p = planWeek(base({ today: D(1), originalPlan: [D(0), D(2)] }));
    expect(p.messages.join(' ')).toMatch(/Geen inhaalrace/);
    const s = sweatDates(p);
    for (let i = 1; i < s.length; i++) expect(addDays(s[i - 1]!, 1)).not.toBe(s[i]);
  });

  it('stabiel: wat gepland stond blijft liefst staan', () => {
    const p = planWeek(base({ availability: (d) => (d === D(0) ? { ...std(d), minutes: 30 } : std(d)), originalPlan: [D(0), D(2), D(4), D(6)] }));
    expect(sweatDates(p)).toEqual([D(0), D(2), D(4), D(6)]);
    expect(p.days[0]).toMatchObject({ location: 'gym', minutes: 30 });
  });

  it('tussendagen krijgen een zweetvrije suggestie, na kracht mobiliteit', () => {
    const p = planWeek(base());
    expect(p.days[1]!.light?.id).toBe('mobiliteit');
    expect(p.days.filter((d) => !d.sweat).every((d) => d.light)).toBe(true);
  });

  it('niet aangevinkte dagen → vriendelijke herinnering', () => {
    const p = planWeek(base({ explicit: (d) => d <= D(2) }));
    expect(p.messages[0]).toMatch(/nog niet aangevinkt/);
  });

  it('bijsturing van /coach: 3× kracht, of maar 2 sessies', () => {
    const three = planWeek(base({ adjustments: { version: 1, strengthSessions: 3 } }));
    expect(three.days.filter((d) => d.type === 'strength')).toHaveLength(3);
    const two = planWeek(base({ adjustments: { version: 1, targetSessions: 2, validFrom: MON } }));
    expect(sweatDates(two)).toHaveLength(2);
    const later = planWeek(base({ adjustments: { version: 1, targetSessions: 2, validFrom: D(7) } }));
    expect(sweatDates(later)).toHaveLength(4);
  });

  it('oude voorkeuren worden aangevuld', () => {
    expect(normalizePrefs({ targetPerWeek: 3, thirdSession: 'strength' } as never)).toMatchObject({ targetPerWeek: 3, strengthPerWeek: 3, experience: 'beginner' });
    expect(normalizePrefs({ targetPerWeek: 9 }).targetPerWeek).toBe(4);
  });
});

describe('harde regels (fuzz, rollend)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;

  it('breekt in 2000 willekeurige situaties nooit een regel', () => {
    for (let n = 0; n < 2000; n++) {
      const today = D(Math.floor(rnd() * 7));
      const slotsFor = (d: string): Slot[] => {
        const r = rnd();
        if (dayIndex(d) >= 5) return r < 0.3 ? [] : r < 0.6 ? ['day'] : r < 0.8 ? ['evening'] : ['day', 'evening'];
        return r < 0.4 ? [] : ['evening'];
      };
      const avMap = new Map<string, DayAvailability>();
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        avMap.set(d, {
          date: d, slots: slotsFor(d), minutes: pick([30, 45, 60] as const), home: rnd() < 0.15,
          tennis: dayIndex(d) === 3 && rnd() < 0.3 ? pick([60, 120]) : undefined,
          want: rnd() < 0.2 ? pick(['strength', 'cardio'] as const) : undefined,
        });
      }
      const history: SessionLog[] = [];
      for (let i = -8; i < 0; i++) {
        const d = addDays(today, i);
        if (rnd() < 0.45 && !history.some((h) => h.date === addDays(d, -1))) history.push(done(d, pick(['strength', 'class', 'cardio'] as const), pick(['A', 'B'] as const)));
      }
      const trainAtHome = rnd() < 0.3;
      const p = planWeek({
        today, availability: (d) => avMap.get(d)!, history,
        prefs: { ...DEFAULT_PREFS, targetPerWeek: pick([2, 3, 4]), strengthPerWeek: pick([1, 2, 3]), trainAtHome },
        readinessToday: pick(['green', 'orange', 'red', undefined] as const),
        avoidWeekdays: rnd() < 0.3 ? [Math.floor(rnd() * 7)] : [],
        soreToday: rnd() < 0.2 ? ['benen'] : [],
        weather: (d) => (rnd() < 0.5 ? { date: d, code: pick([0, 3, 63, 95]), tMax: 10, tMin: 3, precipProb: pick([0, 50, 90]), precipSum: 0, windMax: 10, hours: [] } : undefined),
      });
      const ctx = JSON.stringify({ today, history: history.map((h) => h.date), av: [...avMap.values()] });
      expect(p.violations, ctx).toEqual([]);
      const planned = p.days.filter((d) => d.status === 'planned' && d.type !== 'tennis').map((d) => d.date);
      const tennis = p.days.filter((d) => d.type === 'tennis').map((d) => d.date);
      for (const d of planned) expect(resolveDay(avMap.get(d)!, trainAtHome).available, ctx).toBe(true);
      if (!trainAtHome) for (const d of p.days.filter((x) => x.status === 'planned' && x.type !== 'tennis')) expect(d.location, ctx).toBe('gym');
      // Onafhankelijke hercontrole.
      const all = [...history.map((h) => h.date), ...tennis, ...planned].sort();
      for (const d of planned) {
        expect(all, ctx).not.toContain(addDays(d, -1));
        expect(all, ctx).not.toContain(addDays(d, 1));
        for (let k = 0; k < 7; k++) {
          const from = addDays(d, -k);
          expect(all.filter((x) => x >= from && x <= addDays(from, 6)).length, ctx).toBeLessThanOrEqual(MAX_PER_WEEK);
        }
      }
    }
  });
});

describe('de coach denkt mee: herstel, je keuze, het weer en het waarom', () => {
  it('tennis + 2 plekken: kracht gaat voor, en de coach zegt eerlijk waarom er geen cycling staat', () => {
    // Wo kan niet, do tennis (blokkeert vr), za/zo overdag, ma avond, di kan niet.
    const WED = '2026-11-18';
    const av = (d: string): DayAvailability => {
      const i = dayIndex(d);
      if (i === 2 || i === 1) return { date: d, slots: [], minutes: 45 };
      if (i === 3) return { date: d, slots: ['evening'], minutes: 45, tennis: 60 };
      return std(d);
    };
    const p = planWeek(base({ today: WED, availability: av }));
    expect(short(p)).toBe('.T.A.B.');
    expect(p.days[3]!.why).toMatch(/Kracht gaat voor: tennis is al je conditie/);
    expect(p.messages.join(' ')).toMatch(/Indoor cycling staat er deze 7 dagen niet in: tennis is al je conditie en kracht gaat voor\. Liever indoor cycling op zaterdag\?/);
    // Jij kiest: zaterdag liever cycling → zaterdag les, maandag kracht.
    const q = planWeek(base({ today: WED, availability: (d) => (d === '2026-11-21' ? { ...av(d), want: 'cardio' } : av(d)) }));
    expect(short(q)).toBe('.T.G.A.');
    expect(q.days[3]).toMatchObject({ want: 'cardio', groupClass: true });
    expect(q.days[3]!.why).toMatch(/^Jouw keuze: indoor cycling\./);
    expect(q.messages.join(' ')).toMatch(/1× kracht in plaats van 2×/);
    expect(q.violations).toEqual([]);
  });

  it('elke dag heeft een waarom', () => {
    const p = planWeek(base());
    for (const d of p.days) expect(d.why, d.date).toBeTruthy();
    expect(p.days[2]!.why).toMatch(/^Lesmoment indoor cycling/);
    expect(p.days[1]!.why).toBe('Rustdag na kracht gisteren: je spieren bouwen nu op.');
  });

  it('jouw keuze "liever kracht" op een lesmoment wordt gevolgd', () => {
    const p = planWeek(base({ availability: (d) => (d === D(2) ? { ...std(d), want: 'strength' } : std(d)) }));
    expect(p.days[2]).toMatchObject({ type: 'strength', want: 'strength' });
    expect(p.violations).toEqual([]);
  });

  it('spierpijn in je benen vandaag: kracht met bovenlichaam eerst', () => {
    const p = planWeek(base({ soreToday: ['benen'] }));
    expect(p.days[0]).toMatchObject({ type: 'strength' });
    expect(p.days[0]!.focus?.reduce).toEqual(['benen']);
    expect(p.days[0]!.why).toMatch(/Benen nog moe \(spierpijn\)/);
  });

  it('2u tennis donderdag: de kracht van het weekend schuift liefst naar zondag (schouders hersteld)', () => {
    const p = planWeek(base({ availability: (d) => (d === D(3) ? { ...std(d), tennis: 120 } : dayIndex(d) <= 2 ? { date: d, slots: [], minutes: 45 } : std(d)) }));
    expect(p.days[5]!.sweat).toBe(false);
    expect(p.days[6]).toMatchObject({ type: 'strength' });
  });

  it('weekdag die vaak wegvalt: de planner kiest liever een andere dag', () => {
    const prefs = { ...DEFAULT_PREFS, targetPerWeek: 3 };
    expect(planWeek(base({ prefs })).days[0]!.sweat).toBe(true);
    const p = planWeek(base({ prefs, avoidWeekdays: [0] }));
    expect(p.days[0]!.sweat).toBe(false);
    expect(sweatDates(p)).toHaveLength(3);
    expect(p.violations).toEqual([]);
    // Nooit een sessie minder om een dag te vermijden: met 4 blijft maandag staan.
    expect(sweatDates(planWeek(base({ avoidWeekdays: [0] })))).toHaveLength(4);
  });

  it('weer: droog → wandelen met het beste moment; regen → binnen; zweetdagen veranderen nooit door het weer', () => {
    const hrs = (prob: number) => Array.from({ length: 24 }, (_, h) => ({ hour: h, temp: 9, precipProb: prob, precip: prob > 60 ? 1.5 : 0, code: prob > 60 ? 63 : 2, wind: 10 }));
    const wx = (prob: number) => (d: string) => ({ date: d, code: prob > 60 ? 63 : 2, tMax: 9, tMin: 2, precipProb: prob, precipSum: prob > 60 ? 8 : 0, windMax: 12, hours: hrs(prob) });
    const dry = planWeek(base({ weather: wx(5) }));
    const wet = planWeek(base({ weather: wx(90) }));
    const none = planWeek(base());
    expect(sweatDates(dry)).toEqual(sweatDates(none));
    expect(sweatDates(wet)).toEqual(sweatDates(none));
    expect(dry.days[1]).toMatchObject({ type: 'light', light: { id: 'wandeling' }, walk: { verdict: 'goed' } });
    expect(dry.days[1]!.weather).toMatchObject({ icon: '🌤️', tMax: 9 });
    expect(wet.days.filter((d) => d.type === 'light').every((d) => d.light!.id !== 'wandeling')).toBe(true);
    expect(dry.days.filter((d) => d.type === 'light').every((d) => d.light!.id === 'wandeling')).toBe(true);
  });
});

describe('validateRolling', () => {
  it('detecteert alle regelbreuken', () => {
    const v = validateRolling({
      sessions: [D(0), D(1), D(3), D(5), D(6)].map((date) => ({ date, planned: true })),
      available: (d) => d !== D(6),
    });
    const rules = v.map((x) => x.rule);
    expect(rules).toContain('max_per_7_days');
    expect(rules).toContain('consecutive');
    expect(rules).toContain('unavailable');
  });

  it('zondag gedaan + maandag gepland = overtreding (geen weekgrens nodig)', () => {
    const v = validateRolling({ sessions: [{ date: D(-1), planned: false }, { date: D(0), planned: true }] });
    expect(v.map((x) => x.rule)).toEqual(['consecutive']);
  });
});

describe('sanitizeAdjustments', () => {
  it('laat enkel geldige, veilige bijsturing door', () => {
    const { adjustments, errors } = sanitizeAdjustments({
      targetSessions: 9,
      strengthSessions: 3,
      forceDeload: true,
      swaps: [
        { from: 'leg-press', to: 'goblet-squat' },
        { from: 'leg-press', to: 'db-curl' },
        { from: 'bestaat-niet', to: 'goblet-squat' },
      ],
      repRangeOverrides: { 'db-bench': [6, 10], 'leg-press': [12, 8] },
    });
    expect(adjustments).toMatchObject({ targetSessions: 4, strengthSessions: 3, forceDeload: true });
    expect(adjustments.swaps).toEqual([{ from: 'leg-press', to: 'goblet-squat', reason: undefined }]);
    expect(adjustments.repRangeOverrides).toEqual({ 'db-bench': [6, 10] });
    expect(errors.length).toBe(4);
    expect(sanitizeAdjustments({ strengthSessions: 7 }).errors[0]).toMatch(/strengthSessions/);
  });
});
