import { describe, expect, it } from 'vitest';
import { chooseLight } from './light.ts';
import { openMeteoUrl, parseOpenMeteo, walkAdvice, weatherIcon, type DayWeather, type HourWeather } from './weather.ts';

const hours = (f: (h: number) => Partial<HourWeather>): HourWeather[] =>
  Array.from({ length: 24 }, (_, h) => ({ hour: h, temp: 10, precipProb: 5, precip: 0, code: 1, wind: 10, ...f(h) }));
const day = (date: string, hs: HourWeather[]): DayWeather => ({ date, code: 3, tMax: 12, tMin: 4, precipProb: 20, precipSum: 0, windMax: 15, sunrise: 8.2, sunset: 16.8, hours: hs });

describe('weer', () => {
  it('leest het Open-Meteo-antwoord', () => {
    const json = {
      daily: { time: ['2026-11-21'], weather_code: [61], temperature_2m_max: [9.4], temperature_2m_min: [3.1], precipitation_probability_max: [80], precipitation_sum: [6.2], wind_speed_10m_max: [30], sunrise: ['2026-11-21T08:12'], sunset: ['2026-11-21T16:48'] },
      hourly: { time: ['2026-11-21T10:00', '2026-11-21T11:00'], temperature_2m: [7, 8], precipitation_probability: [70, 20], precipitation: [1.2, 0], weather_code: [61, 3], wind_speed_10m: [20, 18] },
    };
    const [d] = parseOpenMeteo(json);
    expect(d).toMatchObject({ date: '2026-11-21', code: 61, tMax: 9.4, precipProb: 80, sunset: 16.8 });
    expect(d!.hours).toHaveLength(2);
    expect(parseOpenMeteo({})).toEqual([]);
    expect(parseOpenMeteo(null)).toEqual([]);
  });

  it('vraagt enkel afgeronde coördinaten op (privacy)', () => {
    const url = openMeteoUrl(51.05432, 3.71789);
    expect(url).toContain('latitude=51.1');
    expect(url).toContain('longitude=3.7');
    expect(url).toContain('timezone=Europe%2FBrussels');
  });

  it('zoekt het beste wandelmoment: droog en bij daglicht', () => {
    const sat = day('2026-11-21', hours((h) => (h < 12 ? { precipProb: 80, precip: 1, code: 61 } : { precipProb: 10, temp: 11 })));
    const a = walkAdvice(sat);
    expect(a.verdict).toBe('goed');
    expect(a.bestHour).toBe(12);
    expect(a.text).toBe('Droog en 11° rond 12u.');
  });

  it('weekdag: voor of na het werk en over de middag; donker → fluo', () => {
    const wed = day('2026-11-25', hours((h) => (h === 19 ? { precipProb: 0 } : { precipProb: 50 })));
    const a = walkAdvice(wed);
    expect(a.bestHour).toBe(19);
    expect(a.text).toMatch(/fluo/);
  });

  it('de hele dag regen → slecht', () => {
    const a = walkAdvice(day('2026-11-21', hours(() => ({ precipProb: 90, precip: 2, code: 63 }))));
    expect(a.verdict).toBe('slecht');
    expect(a.text).toMatch(/90% kans op regen/);
  });

  it('droog → wandelen (ook na kracht); regen → binnen', () => {
    const good = { verdict: 'goed' as const, bestHour: 12, text: 'Droog en 11° rond 12u.' };
    const bad = { verdict: 'slecht' as const, bestHour: 12, text: 'Ook op het beste moment (12u) 90% kans op regen.' };
    expect(chooseLight(true, 1, good).light.id).toBe('wandeling');
    expect(chooseLight(true, 1, good).light.why).toMatch(/spieren herstellen/);
    expect(chooseLight(false, 0, bad).light.id).not.toBe('wandeling');
    expect(chooseLight(false, 0, bad).light.why).toMatch(/Slecht wandelweer/);
    expect(chooseLight(false, 0).light.id).toBe('wandeling');
  });

  it('iconen', () => {
    expect(weatherIcon(0)).toBe('☀️');
    expect(weatherIcon(63)).toBe('🌧️');
    expect(weatherIcon(95)).toBe('⛈️');
  });
});
