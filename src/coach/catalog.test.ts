import { describe, expect, it } from 'vitest';
import { EXERCISES, alternativesFor, getExercise, videoUrl } from './catalog.ts';

describe('catalogus', () => {
  const all = [...EXERCISES.values()];

  it('heeft unieke ids en volledige info', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const e of all) {
      expect(e.tips.length, e.id).toBeGreaterThanOrEqual(2);
      expect(e.repRange[0], e.id).toBeLessThan(e.repRange[1]);
      expect(e.locations.length, e.id).toBeGreaterThan(0);
      expect(videoUrl(e)).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    }
  });

  it('elke zwaardere variant bestaat, is thuis mogelijk en traint hetzelfde', () => {
    for (const e of all.filter((x) => x.harder)) {
      const h = getExercise(e.harder!);
      expect(h.locations, `${e.id} → ${h.id}`).toContain('home');
      expect(['squat', 'lunge'].includes(e.pattern) ? ['squat', 'lunge'] : [e.pattern]).toContain(h.pattern);
    }
  });

  it('elke oefening heeft minstens één alternatief op elke locatie waar ze kan', () => {
    for (const e of all.filter((x) => x.pattern !== 'conditioning')) {
      for (const loc of e.locations) {
        expect(alternativesFor(e.id, loc).length, `${e.id} @ ${loc}`).toBeGreaterThan(0);
      }
    }
  });

  it('alternatieven trainen dezelfde spiergroep en sluiten zichzelf uit', () => {
    const alts = alternativesFor('leg-press', 'gym');
    expect(alts.map((a) => a.id)).not.toContain('leg-press');
    expect(alts.every((a) => a.pattern === 'squat')).toBe(true);
    // zelfde laadsoort (toestel) eerst
    expect(alts[0]!.load).toBe('machine');
  });

  it('gooit een fout bij een onbekende oefening', () => {
    expect(() => getExercise('bestaat-niet')).toThrow();
  });
});
