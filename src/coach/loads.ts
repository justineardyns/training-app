import type { Exercise, GymConfig, HomeEquipment, Location } from './types.ts';

// Realistische gewichtsstappen. Thuis: enkel wat je echt kunt maken met jouw schijven,
// symmetrisch geladen. In de gym: instelbare standaardreeksen.

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step + 1e-9) + 1 }, (_, i) => round(from + i * step));

export const round = (n: number) => Math.round(n * 100) / 100;

export const DEFAULT_GYM: GymConfig = {
  dumbbells: range(2, 40, 2),
  kettlebells: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32],
  barbellKg: 20,
  barbellStep: 2.5,
  machineStep: 5,
  cableStep: 2.5,
};

/** Voorbeeld/standaard tot je eigen materiaal invult bij de eerste opstart. */
export const DEFAULT_HOME: HomeEquipment = {
  dumbbellHandleKg: 2,
  plates: [
    { kg: 1.25, count: 4 },
    { kg: 2.5, count: 4 },
    { kg: 5, count: 4 },
  ],
  connectorKg: 1,
  kettlebellsKg: [12],
};

/** Alle sommen die je per kant kunt maken met maximaal `perSide` schijven van elk gewicht. */
export function sideSums(plates: { kg: number; perSide: number }[]): number[] {
  let sums = new Set<number>([0]);
  for (const p of plates) {
    if (p.perSide <= 0 || p.kg <= 0) continue;
    const next = new Set<number>();
    for (const s of sums) for (let k = 0; k <= p.perSide; k++) next.add(round(s + k * p.kg));
    sums = next;
  }
  return [...sums].sort((a, b) => a - b);
}

function homeOptions(ex: Exercise, eq: HomeEquipment): number[] {
  const perSide = (div: number) => eq.plates.map((p) => ({ kg: p.kg, perSide: Math.floor(p.count / div) }));
  switch (ex.load) {
    case 'db_pair': // twee dumbbells × twee kanten → 4 schijven per combinatie
      return sideSums(perSide(4)).map((s) => round(eq.dumbbellHandleKg + 2 * s));
    case 'db_single':
      return sideSums(perSide(2)).map((s) => round(eq.dumbbellHandleKg + 2 * s));
    case 'home_bar':
      return sideSums(perSide(2)).map((s) => round(2 * eq.dumbbellHandleKg + eq.connectorKg + 2 * s));
    case 'kb':
      return [...eq.kettlebellsKg].sort((a, b) => a - b);
    case 'bodyweight':
      return [0];
    default:
      return []; // toestellen/kabel/gymstang bestaan thuis niet
  }
}

function gymOptions(ex: Exercise, gym: GymConfig): number[] {
  switch (ex.load) {
    case 'db_pair':
    case 'db_single':
      return [...gym.dumbbells].sort((a, b) => a - b);
    case 'kb':
      return [...gym.kettlebells].sort((a, b) => a - b);
    case 'barbell':
      return range(gym.barbellKg, ex.maxLoad ?? 200, gym.barbellStep);
    case 'machine':
      return range(gym.machineStep, ex.maxLoad ?? 150, gym.machineStep);
    case 'cable':
      return range(gym.cableStep, ex.maxLoad ?? 100, gym.cableStep);
    case 'bodyweight':
      return [0];
    default:
      return [];
  }
}

export function loadOptions(ex: Exercise, location: Location, eq: HomeEquipment, gym: GymConfig = DEFAULT_GYM): number[] {
  const opts = location === 'home' ? homeOptions(ex, eq) : gymOptions(ex, gym);
  return [...new Set(opts)].sort((a, b) => a - b);
}

/** Kan deze oefening op deze locatie met dit materiaal? */
export function isAvailable(ex: Exercise, location: Location, eq: HomeEquipment, gym: GymConfig = DEFAULT_GYM): boolean {
  return ex.locations.includes(location) && loadOptions(ex, location, eq, gym).length > 0;
}

/** Dichtstbijzijnde geldige stap (bij gelijke afstand de lichtste). */
export function snapLoad(target: number, options: number[], mode: 'nearest' | 'down' | 'up' = 'nearest'): number {
  if (options.length === 0) return 0;
  if (mode === 'down') return [...options].reverse().find((o) => o <= target + 1e-9) ?? options[0]!;
  if (mode === 'up') return options.find((o) => o >= target - 1e-9) ?? options[options.length - 1]!;
  return options.reduce((best, o) => (Math.abs(o - target) < Math.abs(best - target) - 1e-9 ? o : best), options[0]!);
}

/** `steps` stappen zwaarder (of lichter bij negatief). Null als dat niet bestaat. */
export function stepLoad(current: number, options: number[], steps: number): number | null {
  if (options.length === 0) return null;
  const idx = options.indexOf(snapLoad(current, options));
  const next = idx + steps;
  if (next < 0 || next >= options.length) return null;
  return options[next]!;
}

/** Schijven per kant om `total` te maken (thuis), zwaarste eerst. Null als het niet kan. */
export function platesPerSide(ex: Exercise, total: number, eq: HomeEquipment): number[] | null {
  let base: number;
  let div: number;
  if (ex.load === 'db_pair') [base, div] = [eq.dumbbellHandleKg, 4];
  else if (ex.load === 'db_single') [base, div] = [eq.dumbbellHandleKg, 2];
  else if (ex.load === 'home_bar') [base, div] = [2 * eq.dumbbellHandleKg + eq.connectorKg, 2];
  else return null;
  const side = round((total - base) / 2);
  if (side < -1e-9) return null;
  const plates = [...eq.plates].sort((a, b) => b.kg - a.kg);
  const result: number[] = [];
  const solve = (i: number, left: number): boolean => {
    if (Math.abs(left) < 1e-6) return true;
    if (i >= plates.length || left < 0) return false;
    const p = plates[i]!;
    const max = Math.floor(p.count / div);
    for (let k = Math.min(max, Math.floor((left + 1e-6) / p.kg)); k >= 0; k--) {
      for (let j = 0; j < k; j++) result.push(p.kg);
      if (solve(i + 1, round(left - k * p.kg))) return true;
      result.splice(result.length - k, k);
    }
    return false;
  };
  return solve(0, side) ? result : null;
}

const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 });
export const kg = (n: number) => `${nf.format(n)} kg`;

export function formatLoad(ex: Exercise, load: number): string {
  if (ex.load === 'bodyweight' || load === 0) return 'lichaamsgewicht';
  if (ex.load === 'db_pair') return `2 × ${kg(load)}`;
  return kg(load);
}
