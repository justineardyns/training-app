import { isWeekend } from './availability.ts';
import type { ISODate } from './types.ts';

// Weer voor de zweetvrije dagen (wandelen of binnen?). Pure functies; het ophalen gebeurt op je iPhone
// (Open-Meteo: gratis, geen sleutel). Zonder weerdata plant de coach gewoon zoals vroeger.

export interface HourWeather {
  hour: number;
  temp: number;
  /** Kans op neerslag (%). */
  precipProb: number;
  /** Neerslag (mm). */
  precip: number;
  code: number;
  wind: number;
}

export interface DayWeather {
  date: ISODate;
  code: number;
  tMax: number;
  tMin: number;
  precipProb: number;
  precipSum: number;
  windMax: number;
  /** Uur van zonsondergang (lokaal, met decimalen). */
  sunset?: number;
  sunrise?: number;
  hours: HourWeather[];
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 95) return '⛈️';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️';
  if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return '🌦️';
  if (code >= 61 && code <= 67) return '🌧️';
  return '☁️';
}

export function weatherText(code: number): string {
  if (code === 0) return 'zonnig';
  if (code <= 2) return 'licht bewolkt';
  if (code === 3) return 'bewolkt';
  if (code === 45 || code === 48) return 'mist';
  if (code >= 51 && code <= 57) return 'motregen';
  if (code >= 61 && code <= 67) return 'regen';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'sneeuw';
  if (code >= 80 && code <= 82) return 'buien';
  if (code >= 95) return 'onweer';
  return 'bewolkt';
}

export type Verdict = 'goed' | 'matig' | 'slecht';

export interface WalkAdvice {
  verdict: Verdict;
  /** Beste uur om te vertrekken (lokaal). */
  bestHour?: number;
  /** Korte uitleg, bv. "Droog en 11° rond 12u." */
  text: string;
  /** Hoe goed het wandelweer is (hoger = beter), om de beste dag van de week te kiezen. */
  score: number;
}

/** Wanneer kan je wandelen? Weekdag: voor of na het werk en over de middag; weekend: overdag. */
export function walkHours(date: ISODate): number[] {
  return isWeekend(date) ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : [7, 12, 13, 17, 18, 19, 20];
}

function hourScore(h: HourWeather, daylight: boolean): number {
  let s = 100 - h.precipProb - 40 * Math.min(2, h.precip) - Math.max(0, h.wind - 25);
  if (h.temp < 3) s -= (3 - h.temp) * 4;
  if (h.temp > 27) s -= (h.temp - 27) * 4;
  if (h.code >= 95) s -= 80;
  if (daylight) s += 8;
  return s;
}

function verdictFor(h: HourWeather): Verdict {
  if (h.code >= 95 || h.precipProb >= 60 || h.precip >= 0.5 || h.wind >= 45 || h.temp <= -3 || h.temp >= 32) return 'slecht';
  if (h.precipProb >= 30 || h.wind >= 30 || h.temp < 3 || h.temp > 28) return 'matig';
  return 'goed';
}

export function walkAdvice(day: DayWeather): WalkAdvice {
  const allowed = new Set(walkHours(day.date));
  const hours = day.hours.filter((h) => allowed.has(h.hour));
  const daylight = (h: number) => day.sunrise === undefined || day.sunset === undefined || (h >= day.sunrise && h + 1 <= day.sunset);
  if (hours.length === 0) {
    const v: Verdict = day.precipProb >= 70 || day.precipSum >= 5 ? 'slecht' : day.precipProb >= 40 ? 'matig' : 'goed';
    return { verdict: v, score: 100 - day.precipProb - 10 * Math.min(5, day.precipSum), text: `${cap(weatherText(day.code))}, ${Math.round(day.tMax)}°, ${day.precipProb}% kans op regen.` };
  }
  const best = [...hours].sort((a, b) => hourScore(b, daylight(b.hour)) - hourScore(a, daylight(a.hour)) || a.hour - b.hour)[0]!;
  const verdict = verdictFor(best);
  const t = Math.round(best.temp);
  const dark = !daylight(best.hour) ? ' (al donker: draag iets fluo)' : '';
  const text =
    verdict === 'goed'
      ? `${best.precipProb < 15 ? 'Droog' : 'Wellicht droog'} en ${t}° rond ${best.hour}u${dark}.`
      : verdict === 'matig'
        ? `Beste moment rond ${best.hour}u: ${t}°, ${best.precipProb}% kans op een bui${best.wind >= 30 ? ', veel wind' : ''}${dark}.`
        : `Ook op het beste moment (${best.hour}u) ${best.code >= 95 ? 'onweer' : best.precipProb >= 60 || best.precip >= 0.5 ? `${best.precipProb}% kans op regen` : best.wind >= 45 ? 'storm' : `${t}°`}.`;
  return { verdict, bestHour: best.hour, text, score: hourScore(best, daylight(best.hour)) };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Open-Meteo-antwoord → per dag. Robuust: ontbrekende velden worden overgeslagen. */
export function parseOpenMeteo(json: unknown): DayWeather[] {
  const j = json as {
    daily?: Record<string, unknown[]>;
    hourly?: Record<string, unknown[]>;
  };
  const d = j?.daily;
  const h = j?.hourly;
  if (!d || !Array.isArray(d.time)) return [];
  const num = (a: unknown[] | undefined, i: number, def = 0) => (Array.isArray(a) && typeof a[i] === 'number' ? (a[i] as number) : def);
  const hourOf = (s: unknown) => (typeof s === 'string' && s.length >= 16 ? Number(s.slice(11, 13)) + Number(s.slice(14, 16)) / 60 : undefined);
  const byDay = new Map<string, HourWeather[]>();
  if (h && Array.isArray(h.time)) {
    h.time.forEach((t, i) => {
      if (typeof t !== 'string') return;
      const date = t.slice(0, 10);
      const list = byDay.get(date) ?? [];
      list.push({
        hour: Number(t.slice(11, 13)),
        temp: num(h.temperature_2m, i),
        precipProb: num(h.precipitation_probability, i),
        precip: num(h.precipitation, i),
        code: num(h.weather_code, i),
        wind: num(h.wind_speed_10m, i),
      });
      byDay.set(date, list);
    });
  }
  const out: DayWeather[] = [];
  d.time.forEach((t, i) => {
    if (typeof t !== 'string') return;
    const day: DayWeather = {
      date: t,
      code: num(d.weather_code, i),
      tMax: num(d.temperature_2m_max, i),
      tMin: num(d.temperature_2m_min, i),
      precipProb: num(d.precipitation_probability_max, i),
      precipSum: num(d.precipitation_sum, i),
      windMax: num(d.wind_speed_10m_max, i),
      hours: byDay.get(t) ?? [],
    };
    const rise = hourOf(d.sunrise?.[i]);
    const set = hourOf(d.sunset?.[i]);
    if (rise !== undefined) day.sunrise = rise;
    if (set !== undefined) day.sunset = set;
    out.push(day);
  });
  return out;
}

/** URL voor Open-Meteo (coördinaten afgerond op ±10 km: genoeg voor het weer, privé genoeg). */
export function openMeteoUrl(lat: number, lon: number): string {
  const r = (x: number) => (Math.round(x * 10) / 10).toFixed(1);
  const q = new URLSearchParams({
    latitude: r(lat),
    longitude: r(lon),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m',
    timezone: 'Europe/Brussels',
    forecast_days: '8',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** Steden om snel te kiezen (zonder typen). */
export const PLACES: { name: string; lat: number; lon: number }[] = [
  { name: 'Brussel', lat: 50.85, lon: 4.35 },
  { name: 'Antwerpen', lat: 51.22, lon: 4.4 },
  { name: 'Gent', lat: 51.05, lon: 3.72 },
  { name: 'Brugge', lat: 51.21, lon: 3.22 },
  { name: 'Leuven', lat: 50.88, lon: 4.7 },
  { name: 'Mechelen', lat: 51.03, lon: 4.48 },
  { name: 'Aalst', lat: 50.94, lon: 4.04 },
  { name: 'Kortrijk', lat: 50.83, lon: 3.26 },
  { name: 'Hasselt', lat: 50.93, lon: 5.34 },
  { name: 'Oostende', lat: 51.23, lon: 2.92 },
  { name: 'Sint-Niklaas', lat: 51.17, lon: 4.14 },
  { name: 'Genk', lat: 50.97, lon: 5.5 },
  { name: 'Turnhout', lat: 51.32, lon: 4.95 },
  { name: 'Namen', lat: 50.47, lon: 4.87 },
  { name: 'Luik', lat: 50.63, lon: 5.57 },
  { name: 'Charleroi', lat: 50.41, lon: 4.44 },
];
