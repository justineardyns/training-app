import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXERCISES } from './catalog.ts';
import { IMAGE_SOURCES, imagesFor } from './images.ts';

describe("oefenfoto's", () => {
  it('elke foto hoort bij een bestaande oefening en staat in public/ex', () => {
    for (const id of Object.keys(IMAGE_SOURCES)) {
      expect(EXERCISES.has(id), id).toBe(true);
      for (const p of imagesFor(id)!) expect(existsSync(`public/${p}`), p).toBe(true);
    }
  });

  it('alle oefeningen uit de schema\'s in Jims hebben een foto (toestel herkennen)', () => {
    const gymMachines = [...EXERCISES.values()].filter((e) => e.load === 'machine' || e.load === 'cable');
    for (const e of gymMachines) expect(imagesFor(e.id), e.id).toBeDefined();
  });
});
