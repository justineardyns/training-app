import { describe, expect, it } from 'vitest';
import { getExercise } from './catalog.ts';
import { DEFAULT_GYM, formatLoad, isAvailable, loadOptions, platesPerSide, sideSums, snapLoad, stepLoad } from './loads.ts';
import type { HomeEquipment } from './types.ts';

const home: HomeEquipment = {
  dumbbellHandleKg: 2,
  plates: [
    { kg: 1.25, count: 4 },
    { kg: 2.5, count: 4 },
    { kg: 5, count: 2 },
  ],
  connectorKg: 1,
  kettlebellsKg: [12],
};

describe('sideSums', () => {
  it('maakt alle combinaties per kant', () => {
    expect(sideSums([{ kg: 1.25, perSide: 1 }, { kg: 2.5, perSide: 1 }])).toEqual([0, 1.25, 2.5, 3.75]);
    expect(sideSums([{ kg: 5, perSide: 0 }])).toEqual([0]);
  });
});

describe('thuisgewichten', () => {
  it('twee dumbbells: enkel combinaties waarvoor je 4 schijven hebt', () => {
    // 4×1,25 en 4×2,5 → per kant max 1 van elk; 2×5 kg kan niet op 4 kanten
    expect(loadOptions(getExercise('rdl-db'), 'home', home)).toEqual([2, 4.5, 7, 9.5]);
  });

  it('één dumbbell: alle schijven op één dumbbell', () => {
    const opts = loadOptions(getExercise('goblet-squat'), 'home', home);
    expect(opts[0]).toBe(2);
    expect(opts.at(-1)).toBe(2 + 2 * (2 * 1.25 + 2 * 2.5 + 5)); // 27
    expect(opts).toContain(12); // 5 per kant
  });

  it('thuisstang = 2 handgrepen + verbindingsstuk + schijven', () => {
    const opts = loadOptions(getExercise('rdl-homebar'), 'home', home);
    expect(opts[0]).toBe(5);
    expect(opts.at(-1)).toBe(30);
  });

  it('kettlebell: enkel jouw kettlebell(s)', () => {
    expect(loadOptions(getExercise('kb-swing'), 'home', home)).toEqual([12]);
    expect(isAvailable(getExercise('kb-swing'), 'home', { ...home, kettlebellsKg: [] })).toBe(false);
  });

  it('toestellen bestaan thuis niet', () => {
    expect(isAvailable(getExercise('leg-press'), 'home', home)).toBe(false);
    expect(isAvailable(getExercise('push-up'), 'home', home)).toBe(true);
  });

  it('geeft de schijven per kant', () => {
    expect(platesPerSide(getExercise('goblet-squat'), 12, home)).toEqual([5]);
    expect(platesPerSide(getExercise('rdl-db'), 9.5, home)).toEqual([2.5, 1.25]);
    expect(platesPerSide(getExercise('rdl-db'), 8, home)).toBeNull();
  });
});

describe('gymgewichten', () => {
  it('heeft realistische stappen', () => {
    expect(loadOptions(getExercise('db-bench'), 'gym', home).slice(0, 3)).toEqual([2, 4, 6]);
    const bar = loadOptions(getExercise('barbell-bench'), 'gym', home);
    expect(bar.slice(0, 3)).toEqual([20, 22.5, 25]);
    expect(loadOptions(getExercise('leg-press'), 'gym', home).at(-1)).toBe(300);
    expect(loadOptions(getExercise('lat-pulldown'), 'gym', home, { ...DEFAULT_GYM, cableStep: 5 })[1]).toBe(10);
  });
});

describe('snap en stap', () => {
  const opts = [2, 4.5, 7, 9.5];
  it('snapt naar een geldige stap', () => {
    expect(snapLoad(5, opts)).toBe(4.5);
    expect(snapLoad(5, opts, 'up')).toBe(7);
    expect(snapLoad(8, opts, 'down')).toBe(7);
    expect(snapLoad(1, opts, 'down')).toBe(2);
  });
  it('gaat een stap omhoog of omlaag', () => {
    expect(stepLoad(4.5, opts, 1)).toBe(7);
    expect(stepLoad(9.5, opts, 1)).toBeNull();
    expect(stepLoad(2, opts, -1)).toBeNull();
  });
  it('toont het gewicht leesbaar', () => {
    expect(formatLoad(getExercise('rdl-db'), 9.5)).toBe('2 × 9,5 kg');
    expect(formatLoad(getExercise('push-up'), 0)).toBe('lichaamsgewicht');
  });
});
