import { describe, expect, it } from 'vitest';
import { defaultDay, resolveDay } from './availability.ts';
import { addDays, dayIndex } from './dates.ts';
import { coachTarget, DEFAULT_PREFS, normalizePrefs, planTwoWeeks, planWeek, type PlanInput, type PlannedDay, type WeekPlan } from './planner.ts';
import { MAX_CARDIO, MAX_PER_WEEK, MAX_STRENGTH, sanitizeAdjustments, validateRolling } from './rules.ts';
import type { DayAvailability, Prefs, SessionLog, Slot, Template } from './types.ts';

const MON = '2026-11-23';
const D = (i: number) => addDays(MON, i);

function done(date: string, kind: SessionLog['kind'] = 'strength', template?: Template, title?: string): SessionLog {
  return { id: `${date}-${kind}-${title ?? ''}`, date, kind, template, title, source: 'app', exercises: [], location: 'gym' };
}
/** Standaard: weekdagen 's avonds, weekend overdag, 45 min. */
const std = (date: string): DayAvailability => defaultDay(date, 45);
const PRO: Prefs = { ...DEFAULT_PREFS, experience: 'returning' };

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  today: MON, availability: std, history: [], prefs: DEFAULT_PREFS, ...over,
});
const trainDates = (p: WeekPlan) => p.days.filter((d) => d.sweat).map((d) => d.date);
/** Per dag: U/L/A/B kracht, G groepsles, C cardio, T tennis, . rust. */
const short = (p: WeekPlan) =>
  p.days.map((d) => (d.type === 'strength' ? d.template : d.type === 'cardio' ? (d.groupClass ? 'G' : 'C') : d.type === 'tennis' ? 'T' : '.')).join('');
const legsCardio = (d: PlannedDay | undefined) => !!d && (d.type === 'cardio' || (d.status === 'done' && d.hair && d.type !== 'tennis'));

/** Onafhankelijke hercontrole van alle harde regels op een plan (enkel waar iets gepland staat). */
function checkRules(p: WeekPlan, history: SessionLog[], ctx = '') {
  const planned = p.days.filter((d) => d.status === 'planned' && d.sweat && d.type !== 'tennis');
  const tennis = p.days.filter((d) => d.type === 'tennis' && d.status === 'planned');
  const all = new Map<string, { kind: 'S' | 'C'; split?: string; legs: boolean; planned: boolean }>();
  for (const h of history.filter((x) => x.kind !== 'light'))
    all.set(h.date, { kind: h.kind === 'strength' ? 'S' : 'C', split: h.template === 'U' ? 'upper' : h.template === 'L' ? 'lower' : 'full', legs: !/tennis/i.test(h.title ?? ''), planned: false });
  for (const d of tennis) all.set(d.date, { kind: 'C', legs: false, planned: false });
  for (const d of planned) all.set(d.date, { kind: d.type === 'strength' ? 'S' : 'C', split: d.split, legs: d.type === 'cardio', planned: true });
  for (const d of planned) {
    const me = all.get(d.date)!;
    for (const nb of [addDays(d.date, -1), addDays(d.date, 1)]) {
      const o = all.get(nb);
      if (!o || (!me.planned && !o.planned)) continue;
      const after = nb > d.date;
      if (me.kind === 'C') expect(o.kind, `${ctx} conditie na elkaar ${d.date}/${nb}`).toBe('S');
      // Benen krijgen een rustdag ná cycling (ervoor mag).
      if (me.kind === 'S' && me.split !== 'upper' && !after) expect(o.kind === 'C' && o.legs, `${ctx} benen na cycling ${nb}/${d.date}`).toBe(false);
      if (me.kind === 'C' && me.legs && after) expect(o.kind === 'S' && o.split !== 'upper', `${ctx} benen na cycling ${d.date}/${nb}`).toBe(false);
      if (me.kind === 'S' && o.kind === 'S') {
        expect(me.split, `${ctx} kracht na elkaar ${d.date}/${nb}`).not.toBe('full');
        expect(o.split, ctx).not.toBe('full');
        expect(me.split, ctx).not.toBe(o.split);
      }
    }
    for (let k = 0; k < 7; k++) {
      const from = addDays(d.date, -k);
      const inWin = [...all].filter(([x]) => x >= from && x <= addDays(from, 6)).map(([, v]) => v);
      expect(inWin.length, `${ctx} totaal`).toBeLessThanOrEqual(p.target);
      expect(inWin.length, ctx).toBeLessThanOrEqual(MAX_PER_WEEK);
      expect(inWin.filter((v) => v.kind === 'C').length, `${ctx} conditie`).toBeLessThanOrEqual(MAX_CARDIO);
      expect(inWin.filter((v) => v.kind === 'S').length, `${ctx} kracht`).toBeLessThanOrEqual(MAX_STRENGTH);
    }
  }
}

describe('de coach kiest: max 6 per 7 dagen, conditie en kracht elk max 4', () => {
  it('absolute beginner start met 4 (opbouw): 2× indoor cycling + 2× kracht', () => {
    const p = planWeek(base());
    expect(p).toMatchObject({ target: 4, cap: 6, strength: 2, cardio: 2 });
    expect(p.days.filter((d) => d.groupClass)).toHaveLength(2);
    expect(p.messages.join(' ')).toMatch(/Opbouw: de eerste weken 4 trainingen/);
    expect(p.violations).toEqual([]);
    checkRules(p, []);
  });

  it('6 trainingen en 1 rustdag: 2× indoor cycling op lesmomenten, de rest kracht', () => {
    const p = planWeek(base({ prefs: PRO }));
    expect(p).toMatchObject({ target: 6, cap: 6, strength: 4, cardio: 2 });
    expect(trainDates(p)).toHaveLength(6);
    expect(p.days.filter((d) => d.groupClass)).toHaveLength(2);
    expect(p.days.filter((d) => d.type === 'cardio' && !d.groupClass)).toHaveLength(0);
    expect(p.violations).toEqual([]);
    checkRules(p, []);
  });

  it('opbouw 4 → 5 → 6, jouw maximum telt, en vaak moe = 1 minder', () => {
    const hist = (n: number) => Array.from({ length: n }, (_, i) => done(addDays(MON, -2 * i - 2), i % 2 ? 'class' : 'strength', 'A'));
    expect(coachTarget({ prefs: DEFAULT_PREFS, history: hist(7), today: MON }).target).toBe(4);
    expect(coachTarget({ prefs: DEFAULT_PREFS, history: hist(8), today: MON }).target).toBe(5);
    expect(coachTarget({ prefs: DEFAULT_PREFS, history: hist(16), today: MON }).target).toBe(6);
    expect(coachTarget({ prefs: PRO, history: [], today: MON }).target).toBe(6);
    expect(coachTarget({ prefs: { ...DEFAULT_PREFS, targetPerWeek: 3 }, history: [], today: MON }).target).toBe(3);
    const tired = [1, 2, 3].map((i) => ({ date: addDays(MON, -i), level: 'orange' as const }));
    expect(coachTarget({ prefs: PRO, history: [], today: MON, readinessLog: tired })).toMatchObject({ target: 5, note: expect.stringMatching(/vaak moe/) });
  });

  it('de dag na indoor cycling: bovenlichaam (benen krijgen een rustdag); conditie nooit 2 dagen na elkaar', () => {
    const p = planWeek(base({ prefs: PRO, availability: (d) => (d === D(0) ? { ...std(d), want: 'cardio' } : std(d)) }));
    expect(p.days[0]).toMatchObject({ groupClass: true });
    expect(p.days[1]).toMatchObject({ type: 'strength', split: 'upper' });
    expect(p.days[1]!.why).toMatch(/gisteren indoor cycling, je benen krijgen een rustdag/);
    for (const [i, d] of p.days.entries()) {
      if (d.type === 'strength' && legsCardio(p.days[i - 1])) expect(d.split, d.date).toBe('upper');
    }
    expect(p.days.some((d) => d.split === 'lower' || d.split === 'full')).toBe(true);
    expect(p.violations).toEqual([]);
    checkRules(p, []);
  });

  it('twee krachtdagen na elkaar: bovenlichaam en benen wisselen af, nooit 2× full body', () => {
    // Enkel ma en di kunnen.
    const av = (d: string): DayAvailability => (d <= D(1) ? std(d) : { date: d, slots: [], minutes: 45 });
    const p = planWeek(base({ prefs: { ...PRO, classSlots: [] }, availability: av }));
    expect(short(p).slice(0, 2).split('').sort().join('')).toBe('LU');
    expect(p.days[1]!.why).toMatch(/gisteren (bovenlichaam|benen), vandaag de andere spieren/);
    checkRules(p, []);
  });

  it('gisteren indoor cycling gedaan: vandaag geen benen; gisteren benen: cycling mag', () => {
    const cyc = [done(addDays(MON, -1), 'class', undefined, 'Indoor cycling')];
    const a = planWeek(base({ prefs: PRO, history: cyc, availability: (d) => (d === D(0) ? { ...std(d), want: 'strength' } : std(d)) }));
    expect(a.days[0]).toMatchObject({ type: 'strength', split: 'upper' });
    checkRules(a, cyc);
    const legs = [done(addDays(MON, -1), 'strength', 'L')];
    const b = planWeek(base({ prefs: PRO, history: legs, availability: (d) => (d === D(0) ? { ...std(d), want: 'cardio' } : std(d)) }));
    expect(b.days[0]).toMatchObject({ type: 'cardio', groupClass: true });
    expect(b.violations).toEqual([]);
  });

  it('het venster rolt mee en telt wat je al deed', () => {
    const history = [done(D(0), 'strength', 'A'), done(D(2), 'class', undefined, 'Indoor cycling')];
    const p = planWeek(base({ today: D(3), history }));
    expect(p.start).toBe(D(3));
    expect(p.days.at(-1)!.date).toBe(D(9));
    expect(p.violations).toEqual([]);
    checkRules(p, history);
  });

  it('enkel Jims: weekendavond wordt nooit gepland (Jims sluit om 17u)', () => {
    const p = planWeek(base({ prefs: PRO, availability: (d) => (dayIndex(d) >= 5 ? { date: d, slots: ['evening'], minutes: 45 } : std(d)) }));
    expect(p.days[5]!.sweat).toBe(false);
    expect(p.days[6]!.sweat).toBe(false);
  });

  it('indoor cycling op de lesmomenten: ma, wo, do avond en za/zo om 10u', () => {
    const p = planWeek(base({ prefs: PRO }));
    for (const d of p.days.filter((x) => x.groupClass)) expect([0, 2, 3, 5, 6]).toContain(dayIndex(d.date));
    const weekend = p.days.find((d) => d.groupClass && dayIndex(d.date) >= 5);
    if (weekend) {
      expect(weekend.title).toBe('Indoor cycling (groepsles) · Jims · 10u');
      expect(weekend.why).toMatch(/om 10u/);
    }
  });

  it('tennis op donderdag = conditie: geen conditie op wo of vr; de dag erna mag gewoon kracht (ook benen)', () => {
    const p = planWeek(base({ prefs: PRO, availability: (d) => (d === D(3) ? { ...std(d), tennis: 120 } : std(d)) }));
    expect(p.days[3]).toMatchObject({ type: 'tennis', title: 'Tennis · 2u', hair: true });
    expect(p.days[2]!.type).not.toBe('cardio');
    expect(p.days[4]!.type).not.toBe('cardio');
    expect(p.violations).toEqual([]);
    const fri = planWeek(base({ prefs: PRO, availability: (d) => (d === D(3) ? { ...std(d), tennis: 120 } : d === D(4) ? { ...std(d), want: 'strength' } : std(d)) }));
    expect(fri.days[4]).toMatchObject({ type: 'strength' });
    expect(fri.days[4]!.focus?.reduce ?? []).toEqual([]);
  });

  it('indoor cycling: minstens 1×, liefst 2×; geen lesmoment → de coach zegt hoe je er een krijgt', () => {
    const none = planWeek(base({ prefs: { ...PRO, classSlots: [] } }));
    expect(none.days.some((d) => d.groupClass)).toBe(false);
    expect(none.messages.join(' ')).toMatch(/Geen indoor cycling deze 7 dagen.*Maak een lesmoment groen in de Agenda/);
    // Enkel zaterdag een les: 1×, met een duw naar een tweede.
    const one = planWeek(base({ prefs: { ...PRO, classSlots: [{ day: 5, slot: 'day', time: '10:00' }] } }));
    expect(one.days.filter((d) => d.groupClass)).toHaveLength(1);
    expect(one.messages.join(' ')).toMatch(/1× indoor cycling deze 7 dagen\. Zin in een tweede\?/);
    // Veel lesmomenten: toch maar 2× cycling, de rest kracht.
    const many = planWeek(base({ prefs: { ...PRO, classSlots: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, slot: day >= 5 ? ('day' as const) : ('evening' as const) })) } }));
    expect(many.days.filter((d) => d.groupClass)).toHaveLength(2);
    expect(many.strength).toBe(4);
  });

  it('bijsturing van /coach: 4× kracht, of maar 3 trainingen, of pas vanaf volgende week', () => {
    const four = planWeek(base({ prefs: PRO, adjustments: { version: 1, strengthSessions: 4 } }));
    expect(four.strength).toBe(4);
    expect(four.violations).toEqual([]);
    const three = planWeek(base({ prefs: PRO, adjustments: { version: 1, targetSessions: 3, validFrom: MON } }));
    expect(trainDates(three)).toHaveLength(3);
    const later = planWeek(base({ prefs: PRO, adjustments: { version: 1, targetSessions: 3, validFrom: D(7) } }));
    expect(trainDates(later)).toHaveLength(6);
  });

  it('thuis aangevinkt (enkel als thuistraining aan staat): nooit een groepsles', () => {
    const p = planWeek(base({ availability: (d) => ({ ...std(d), home: true }), prefs: { ...DEFAULT_PREFS, trainAtHome: true } }));
    expect(p.days.filter((d) => d.sweat).every((d) => d.location === 'home' && !d.groupClass)).toBe(true);
  });

  it('full body wisselt A/B over de vensters heen', () => {
    const av = (d: string): DayAvailability => (dayIndex(d) % 2 === 0 ? std(d) : { date: d, slots: [], minutes: 45 });
    const p = planWeek(base({ today: D(2), history: [done(D(0), 'strength', 'A')], availability: av }));
    const fulls = p.days.filter((d) => d.split === 'full');
    if (fulls.length) expect(fulls[0]!.template).toBe('B');
  });

  it('rood vandaag: verplaatst, vandaag mobiliteit; oranje: lichter', () => {
    const red = planWeek(base({ readinessToday: 'red', originalPlan: [D(0)] }));
    expect(red.days[0]).toMatchObject({ status: 'moved', sweat: false });
    expect(red.messages.join(' ')).toMatch(/Rood vandaag/);
    const orange = planWeek(base({ readinessToday: 'orange', originalPlan: [D(0)] }));
    expect(orange.days[0]).toMatchObject({ sweat: true, lighter: true });
  });

  it('gemist: geen inhaalrace, geen stapeling', () => {
    const p = planWeek(base({ today: D(1), originalPlan: [D(0)] }));
    expect(p.messages.join(' ')).toMatch(/Geen inhaalrace/);
    checkRules(p, []);
  });

  it('stabiel: wat gepland stond blijft liefst staan', () => {
    const first = planWeek(base());
    const again = planWeek(base({ availability: (d) => (d === trainDates(first)[0] ? { ...std(d), minutes: 30 } : std(d)), originalPlan: trainDates(first) }));
    expect(trainDates(again)).toEqual(trainDates(first));
  });

  it('rustdagen krijgen een zweetvrije suggestie', () => {
    const p = planWeek(base());
    expect(p.days.filter((d) => !d.sweat).every((d) => d.light && d.why)).toBe(true);
  });

  it('niet aangevinkte dagen → vriendelijke herinnering', () => {
    expect(planWeek(base({ explicit: (d) => d <= D(2) })).messages[0]).toMatch(/nog niet aangevinkt/);
  });

  it('oude voorkeuren → regels van nu: max 6, donderdag les, weekend om 10u', () => {
    const old = normalizePrefs({ targetPerWeek: 4, strengthPerWeek: 2, classSlots: [{ day: 1, slot: 'evening' }, { day: 5, slot: 'day' }] } as never);
    expect(old.targetPerWeek).toBe(6);
    expect(old.classSlots).toEqual([{ day: 1, slot: 'evening' }, { day: 3, slot: 'evening' }, { day: 5, slot: 'day', time: '10:00' }]);
    expect(old.rulesVersion).toBe(2);
    expect(normalizePrefs({ targetPerWeek: 3, thirdSession: 'strength' } as never)).toMatchObject({ targetPerWeek: 3, strengthPerWeek: 3, experience: 'beginner' });
    expect(normalizePrefs({ ...DEFAULT_PREFS, targetPerWeek: 9 }).targetPerWeek).toBe(6);
    expect(normalizePrefs({ ...DEFAULT_PREFS, targetPerWeek: 5 }).targetPerWeek).toBe(5);
  });
});

describe('de coach denkt mee: herstel, je keuze, het weer en het waarom', () => {
  // Jouw week: wo kan niet, do tennis, vr avond, za/zo overdag, ma avond, di kan niet.
  const WED = '2026-11-18';
  const av = (d: string): DayAvailability => {
    const i = dayIndex(d);
    if (i === 2 || i === 1) return { date: d, slots: [], minutes: 45 };
    if (i === 3) return { date: d, slots: ['evening'], minutes: 45, tennis: 60 };
    return std(d);
  };

  it('met tennis staat er toch indoor cycling in, en kracht naast tennis mag', () => {
    const p = planWeek(base({ today: WED, availability: av }));
    expect(p.days.some((d) => d.groupClass)).toBe(true);
    expect(p.days[1]!.type).toBe('tennis');
    expect(p.violations).toEqual([]);
  });

  it('jouw keuze per dag wordt gevolgd: liever cycling of liever kracht', () => {
    const p = planWeek(base({ today: WED, availability: av }));
    const s = p.days.find((d) => d.type === 'strength' && d.classSlot)!;
    const q = planWeek(base({ today: WED, availability: (d) => (d === s.date ? { ...av(d), want: 'cardio' } : av(d)) }));
    expect(q.days.find((d) => d.date === s.date)).toMatchObject({ type: 'cardio', want: 'cardio', groupClass: true });
    expect(q.days.find((d) => d.date === s.date)!.why).toMatch(/^Jouw keuze: indoor cycling\./);
    const c = p.days.find((d) => d.type === 'cardio')!;
    const r = planWeek(base({ today: WED, availability: (d) => (d === c.date ? { ...av(d), want: 'strength' } : av(d)) }));
    expect(r.days.find((d) => d.date === c.date)).toMatchObject({ type: 'strength', want: 'strength' });
    expect(q.violations).toEqual([]);
    expect(r.violations).toEqual([]);
  });

  it('een keuze die de regels breekt, wordt niet gevolgd en de coach zegt het', () => {
    // Woensdag liever cycling, maar donderdag tennis: nooit 2 haarwasdagen na elkaar.
    const p = planWeek(base({ prefs: PRO, availability: (d) => (d === D(3) ? { ...std(d), tennis: 60 } : d === D(2) ? { ...std(d), want: 'cardio' } : std(d)) }));
    expect(p.days[2]!.type).not.toBe('cardio');
    expect(p.messages.join(' ')).toMatch(/Je koos conditie op woensdag, maar dat past daar niet/);
    expect(p.violations).toEqual([]);
  });

  it('elke dag heeft een waarom', () => {
    for (const p of [planWeek(base()), planWeek(base({ prefs: PRO }))]) for (const d of p.days) expect(d.why, d.date).toBeTruthy();
  });

  it('spierpijn in je benen vandaag: geen benentraining of benen 1 set minder', () => {
    const p = planWeek(base({ soreToday: ['benen'] }));
    const today = p.days[0]!;
    if (today.type === 'strength' && today.split !== 'upper') {
      expect(today.focus?.reduce).toEqual(['benen']);
      expect(today.why).toMatch(/Benen nog moe \(spierpijn\)/);
    }
  });

  it('weekdag die vaak wegvalt: de planner kiest liever een andere dag (maar nooit een training minder)', () => {
    const prefs = { ...PRO, targetPerWeek: 3 };
    expect(planWeek(base({ prefs })).days[0]!.sweat).toBe(true);
    const p = planWeek(base({ prefs, avoidWeekdays: [0] }));
    expect(p.days[0]!.sweat).toBe(false);
    expect(trainDates(p)).toHaveLength(3);
  });

  it('weer: droog → wandelen; regen → binnen; trainingsdagen veranderen nooit door het weer', () => {
    const hrs = (prob: number) => Array.from({ length: 24 }, (_, h) => ({ hour: h, temp: 9, precipProb: prob, precip: prob > 60 ? 1.5 : 0, code: prob > 60 ? 63 : 2, wind: 10 }));
    const wx = (prob: number) => (d: string) => ({ date: d, code: prob > 60 ? 63 : 2, tMax: 9, tMin: 2, precipProb: prob, precipSum: prob > 60 ? 8 : 0, windMax: 12, hours: hrs(prob) });
    const dry = planWeek(base({ weather: wx(5) }));
    const wet = planWeek(base({ weather: wx(90) }));
    const none = planWeek(base());
    expect(trainDates(dry)).toEqual(trainDates(none));
    expect(trainDates(wet)).toEqual(trainDates(none));
    expect(dry.days.filter((d) => d.type === 'light').every((d) => d.light!.id === 'wandeling')).toBe(true);
    expect(dry.days.find((d) => d.type === 'light')!.weather).toMatchObject({ icon: '🌤️', tMax: 9 });
    expect(wet.days.filter((d) => d.type === 'light').every((d) => d.light!.id !== 'wandeling')).toBe(true);
  });
});

describe('14 dagen vooruit', () => {
  it('dag 8–14 bouwt verder op dag 1–7: de regels gelden over de grens heen', () => {
    for (const prefs of [DEFAULT_PREFS, PRO]) {
      const { first, second } = planTwoWeeks(base({ prefs }));
      expect(second.start).toBe(D(7));
      expect(second.days).toHaveLength(7);
      expect(second.days.every((d) => d.provisional)).toBe(true);
      expect(second.days.some((d) => d.groupClass)).toBe(true);
      // Samen hercontroleren alsof dag 1–7 gedaan is.
      const asDone = first.days
        .filter((d) => d.status === 'planned' && d.sweat)
        .map((d) => done(d.date, d.type === 'strength' ? 'strength' : 'class', d.template, d.type === 'tennis' ? 'Tennis' : 'Indoor cycling'));
      expect(second.violations).toEqual([]);
      checkRules(second, asDone, prefs.experience);
    }
  });

  it('een gereserveerde les blijft vast staan (ook in de voorlopige week)', () => {
    const { second } = planTwoWeeks(base());
    const strengthOnClass = second.days.find((d) => d.type === 'strength' && d.classSlot) ?? second.days.find((d) => d.type === 'light' && [0, 2, 3, 5, 6].includes(dayIndex(d.date)))!;
    const booked = planTwoWeeks(base({ availability: (d) => (d === strengthOnClass.date ? { ...std(d), booked: true } : std(d)) }));
    const day = [...booked.first.days, ...booked.second.days].find((d) => d.date === strengthOnClass.date)!;
    if (day.type === 'cardio') {
      expect(day).toMatchObject({ booked: true, groupClass: true });
      expect(day.why).toMatch(/^Gereserveerd: indoor cycling/);
    } else expect([...booked.first.messages, ...booked.second.messages].join(' ')).toMatch(/Je reserveerde een les/);
  });
});

describe('harde regels (fuzz, rollend)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]!;

  it('breekt in 1500 willekeurige situaties nooit een regel', () => {
    for (let n = 0; n < 1500; n++) {
      const today = D(Math.floor(rnd() * 7));
      const slotsFor = (d: string): Slot[] => {
        const r = rnd();
        if (dayIndex(d) >= 5) return r < 0.3 ? [] : r < 0.6 ? ['day'] : r < 0.8 ? ['evening'] : ['day', 'evening'];
        return r < 0.3 ? [] : ['evening'];
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
        if (rnd() < 0.55) {
          const kind = pick(['strength', 'class', 'cardio'] as const);
          history.push(done(d, kind, kind === 'strength' ? pick(['A', 'B', 'U', 'L'] as const) : undefined, kind === 'cardio' && rnd() < 0.3 ? 'Tennis' : undefined));
        }
      }
      const trainAtHome = rnd() < 0.2;
      const prefs = { ...DEFAULT_PREFS, experience: pick(['beginner', 'returning'] as const), targetPerWeek: pick([2, 3, 4, 5, 6]), trainAtHome };
      const p = planWeek({
        today, availability: (d) => avMap.get(d)!, history, prefs,
        readinessToday: pick(['green', 'orange', 'red', undefined] as const),
        adjustments: rnd() < 0.2 ? { version: 1, strengthSessions: pick([1, 2, 3, 4]) } : undefined,
        avoidWeekdays: rnd() < 0.3 ? [Math.floor(rnd() * 7)] : [],
        soreToday: rnd() < 0.2 ? ['benen'] : [],
        weather: (d) => (rnd() < 0.5 ? { date: d, code: pick([0, 3, 63, 95]), tMax: 10, tMin: 3, precipProb: pick([0, 50, 90]), precipSum: 0, windMax: 10, hours: [] } : undefined),
      });
      const ctx = JSON.stringify({ today, history: history.map((h) => `${h.date}:${h.kind}:${h.template ?? h.title ?? ''}`), av: [...avMap.values()], plan: short(p) });
      expect(p.violations, ctx).toEqual([]);
      expect(p.target, ctx).toBeLessThanOrEqual(prefs.targetPerWeek);
      for (const d of p.days.filter((x) => x.status === 'planned' && x.type !== 'tennis')) {
        expect(resolveDay(avMap.get(d.date)!, trainAtHome).available, ctx).toBe(true);
        if (!trainAtHome) expect(d.location, ctx).toBe('gym');
      }
      checkRules(p, history, ctx);
      if (n % 5 === 0) {
        const two = planTwoWeeks({ today, availability: (d) => avMap.get(d) ?? defaultDay(d, 45), history, prefs });
        expect(two.second.violations, ctx).toEqual([]);
      }
    }
  });
});

describe('validateRolling', () => {
  const S = (date: string, planned = true, split?: 'full' | 'upper' | 'lower') => ({ date, planned, kind: 'strength' as const, split });
  const C = (date: string, planned = true, legs = true) => ({ date, planned, kind: 'cardio' as const, legs });

  it('detecteert alle regelbreuken', () => {
    const rules = (sessions: Parameters<typeof validateRolling>[0]['sessions']) => validateRolling({ sessions }).map((v) => v.rule);
    expect(rules([C(D(0)), C(D(1))])).toContain('consecutive_cardio');
    expect(rules([C(D(0)), S(D(1), true, 'lower')])).toContain('legs_after_cycling');
    expect(rules([C(D(0)), S(D(1), true, 'full')])).toContain('legs_after_cycling');
    expect(rules([C(D(0)), S(D(1), true, 'upper')])).toEqual([]);
    expect(rules([S(D(0), true, 'lower'), C(D(1))])).toEqual([]); // benen de dag vóór cycling mag
    expect(rules([C(D(0), true, false), S(D(1), true, 'lower')])).toEqual([]); // tennis
    expect(rules([S(D(0), true, 'upper'), S(D(1), true, 'upper')])).toContain('same_muscles');
    expect(rules([S(D(0), true, 'full'), S(D(1), true, 'upper')])).toContain('same_muscles');
    expect(rules([S(D(0), true, 'upper'), S(D(1), true, 'lower')])).toEqual([]);
    expect(rules([S(D(0)), C(D(0))])).toContain('double_day');
    expect(rules([0, 1, 2, 4, 6].map((i) => C(D(i))))).toContain('max_cardio');
    expect(rules([0, 1, 2, 3, 4].map((i) => S(D(i), true, i % 2 ? 'upper' : 'lower')))).toContain('max_strength');
    expect(rules([0, 1, 2, 3, 4, 5, 6].map((i) => (i % 2 ? S(D(i), true, 'upper') : C(D(i), true, false))))).toContain('max_per_7_days');
    expect(validateRolling({ sessions: [S(D(0))], available: () => false }).map((v) => v.rule)).toContain('unavailable');
  });

  it('gedaan is een feit: enkel overtredingen met een geplande training tellen', () => {
    expect(validateRolling({ sessions: [C(D(0), false), C(D(1), false)] })).toEqual([]);
    expect(validateRolling({ sessions: [C(D(0), false), C(D(1), true)] }).map((v) => v.rule)).toEqual(['consecutive_cardio']);
  });
});

describe('sanitizeAdjustments', () => {
  it('laat enkel geldige, veilige bijsturing door', () => {
    const r = sanitizeAdjustments({
      version: 1, targetSessions: 9, strengthSessions: 4, forceDeload: true, focus: 'Rug eerst',
      swaps: [{ from: 'leg-press', to: 'hack-squat' }, { from: 'leg-press', to: 'db-curl' }, { from: 'x', to: 'y' }],
      repRangeOverrides: { 'db-bench': [6, 10], 'leg-press': [20, 10] }, hacker: true,
    });
    expect(r.adjustments).toMatchObject({ targetSessions: 6, strengthSessions: 4, forceDeload: true, focus: 'Rug eerst' });
    expect(r.adjustments.swaps).toEqual([{ from: 'leg-press', to: 'hack-squat', reason: undefined }]);
    expect(r.adjustments.repRangeOverrides).toEqual({ 'db-bench': [6, 10] });
    expect(r.errors.length).toBe(4);
    expect(sanitizeAdjustments({ version: 1, strengthSessions: 5 }).errors[0]).toMatch(/tussen 1 en 4/);
    expect((r.adjustments as unknown as Record<string, unknown>).hacker).toBeUndefined();
  });
});
