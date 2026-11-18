import { describe, expect, it } from 'vitest';
import { addDays } from './dates.ts';
import { assessReadiness, stats } from './readiness.ts';
import type { HealthDay } from './types.ts';

// 14 dagen basislijn rond HRV 60, rusthartslag 55, slaap 7,5u
function baseline(days = 14): HealthDay[] {
  return Array.from({ length: days }, (_, i) => ({
    date: addDays('2026-11-18', -days + i),
    hrvMs: 60 + ((i % 3) - 1) * 4,
    restingHr: 55 + ((i % 3) - 1),
    sleepHours: 7.5 + ((i % 2) - 0.5) * 0.5,
  }));
}
const today = (over: Partial<HealthDay>): HealthDay => ({ date: '2026-11-18', hrvMs: 60, restingHr: 55, sleepHours: 7.5, ...over });

describe('stats', () => {
  it('gemiddelde en standaardafwijking, negeert lege waarden', () => {
    const s = stats([2, 4, undefined, 6]);
    expect(s.mean).toBe(4);
    expect(s.sd).toBe(2);
    expect(s.n).toBe(3);
  });
});

describe('dagvorm', () => {
  it('normale nacht + oké energie = groen', () => {
    const r = assessReadiness({ today: today({}), history: baseline(), energy: 'ok' });
    expect(r.level).toBe('green');
    expect(r.learning).toBe(false);
  });

  it('lage HRV + hogere rusthartslag = rood', () => {
    const r = assessReadiness({ today: today({ hrvMs: 40, restingHr: 64 }), history: baseline(), energy: 'ok' });
    expect(r.level).toBe('red');
    expect(r.reasons.join(' ')).toMatch(/HRV/);
    expect(r.reasons.join(' ')).toMatch(/Rusthartslag/);
  });

  it('kort geslapen + lage energie = rood, enkel kort geslapen = groen of oranje', () => {
    expect(assessReadiness({ today: today({ sleepHours: 4.5 }), history: baseline(), energy: 'low' }).level).toBe('red');
    expect(assessReadiness({ today: today({ sleepHours: 5.5 }), history: baseline(), energy: 'ok' }).level).toBe('green');
    expect(assessReadiness({ today: today({ sleepHours: 4.5 }), history: baseline(), energy: 'ok' }).level).toBe('orange');
  });

  it('enkel lage energie = oranje', () => {
    expect(assessReadiness({ today: today({}), history: baseline(), energy: 'low' }).level).toBe('orange');
  });

  it('hoge energie compenseert een kleine dip', () => {
    const r = assessReadiness({ today: today({ hrvMs: 57, restingHr: 57 }), history: baseline(), energy: 'high' });
    expect(r.level).toBe('green');
  });

  it('zonder Watch-data: puur je tik (top/oké = groen, moe = oranje, ziek of op = rood)', () => {
    expect(assessReadiness({ history: [], energy: 'high' }).level).toBe('green');
    const ok = assessReadiness({ history: [], energy: 'ok' });
    expect(ok.level).toBe('green');
    expect(ok.reasons).toEqual([]);
    expect(assessReadiness({ history: [], energy: 'low' }).level).toBe('orange');
    const sick = assessReadiness({ history: [], energy: 'sick' });
    expect(sick.level).toBe('red');
    expect(sick.reasons[0]).toMatch(/ziek/);
  });

  it('basislijn in opbouw: HRV en rusthartslag tellen nog niet mee', () => {
    const r = assessReadiness({ today: today({ hrvMs: 30, restingHr: 70 }), history: baseline(4), energy: 'ok' });
    expect(r.learning).toBe(true);
    expect(r.level).toBe('green');
    expect(r.reasons.join(' ')).toMatch(/basislijn/);
  });

  it('gebruikt enkel de dagen vóór vandaag', () => {
    const hist = [...baseline(), today({ hrvMs: 20 })];
    const r = assessReadiness({ today: today({ hrvMs: 20 }), history: hist, energy: 'ok' });
    expect(r.baselineDays).toBe(14);
    expect(r.score).toBeLessThan(0);
  });
});
