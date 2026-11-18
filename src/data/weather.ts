import { openMeteoUrl, parseOpenMeteo } from '../coach/weather.ts';
import { DEFAULT_PLACE, type Store, type WeatherPlace } from './store.ts';

// Weerbericht ophalen bij Open-Meteo (gratis, geen sleutel, geen account).
// Enkel je afgeronde coördinaten (±10 km) gaan naar Open-Meteo; niets van je trainingsdata.
// Het bericht blijft lokaal op je iPhone en gaat nooit naar je repo.

const FRESH_MS = 2 * 3600_000;

export function placeOf(store: Store): WeatherPlace {
  return store.local.weatherPlace ?? DEFAULT_PLACE;
}

export async function refreshWeather(store: Store, opts: { force?: boolean; fetchFn?: typeof fetch } = {}): Promise<boolean> {
  const place = placeOf(store);
  const cur = store.weather;
  const same = cur && cur.place.lat === place.lat && cur.place.lon === place.lon;
  if (!opts.force && same && store.now().getTime() - Date.parse(cur.fetchedAt) < FRESH_MS) return false;
  const f = opts.fetchFn ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!f) return false;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : undefined;
  try {
    const res = await f(openMeteoUrl(place.lat, place.lon), { signal: ctrl?.signal ?? null });
    if (!res.ok) return false;
    const days = parseOpenMeteo(await res.json());
    if (days.length === 0) return false;
    await store.setWeather({ fetchedAt: store.now().toISOString(), place, days });
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Kies een plaats (lijst of je huidige locatie) en haal meteen het weer op. */
export async function setWeatherPlace(store: Store, place: WeatherPlace, fetchFn?: typeof fetch): Promise<void> {
  await store.setLocal({ weatherPlace: { name: place.name, lat: Math.round(place.lat * 10) / 10, lon: Math.round(place.lon * 10) / 10 } });
  await refreshWeather(store, fetchFn ? { force: true, fetchFn } : { force: true });
}

/** Je huidige locatie (één keer toestemming vragen). Coördinaten worden meteen afgerond. */
export function currentPlace(): Promise<WeatherPlace> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Locatie is niet beschikbaar op dit toestel.'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ name: 'Mijn locatie', lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error('Geen toegang tot je locatie. Kies een stad.')),
      { enableHighAccuracy: false, maximumAge: 24 * 3600_000, timeout: 10_000 },
    );
  });
}
