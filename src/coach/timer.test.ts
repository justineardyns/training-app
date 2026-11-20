import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME } from './loads.ts';
import { buildCardioSession, buildStrengthSession } from './session.ts';
import { blockAt, blockStart, clock, duration, holdBlocks, intervals, totalSeconds, upcomingSwitches } from './timer.ts';

describe('timer', () => {
  const blocks = [{ label: 'Opwarmen', seconds: 300 }, ...intervals(2, 30, 90), { label: 'Uitbollen', seconds: 300 }];

  it('vindt het juiste blok en de resterende tijd', () => {
    expect(totalSeconds(blocks)).toBe(840);
    expect(blockAt(blocks, 0)).toEqual({ index: 0, left: 300, start: 0 });
    expect(blockAt(blocks, 299.5).index).toBe(0);
    expect(blockAt(blocks, 300)).toEqual({ index: 1, left: 30, start: 300 });
    expect(blocks[1]).toMatchObject({ label: 'Stevig (1/2)', hard: true });
    expect(blockAt(blocks, 340)).toEqual({ index: 2, left: 80, start: 330 });
    expect(blockAt(blocks, 840).index).toBe(blocks.length);
    expect(blockStart(blocks, 3)).toBe(420);
  });

  it('plant een piep bij elke wissel, hoog als er een stevig blok begint', () => {
    expect(upcomingSwitches(blocks, 0)).toEqual([
      { in: 300, hard: true },
      { in: 330, hard: false },
      { in: 420, hard: true },
      { in: 450, hard: false },
      { in: 540, hard: false },
      { in: 840, hard: false },
    ]);
    expect(upcomingSwitches(blocks, 500)).toEqual([
      { in: 40, hard: false },
      { in: 340, hard: false },
    ]);
  });

  it('toont tijden leesbaar', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(75.9)).toBe('1:15');
    expect(clock(3725)).toBe('1:02:05');
    expect(duration(30)).toBe('30 s');
    expect(duration(90)).toBe('1:30 min');
    expect(duration(2700)).toBe('45 min');
  });

  it('per kant: klaarzetten, kant, wissel, andere kant', () => {
    expect(holdBlocks(30, false).map((b) => b.seconds)).toEqual([5, 30]);
    expect(holdBlocks(20, true).map((b) => b.label)).toEqual(['Klaar zetten', 'Eerste kant', 'Wissel van kant', 'Andere kant']);
  });
});

describe('cardio met timer', () => {
  it('intervallen en zone 2 duren precies zo lang als gekozen', () => {
    for (const minutes of [30, 45, 60] as const) {
      const hard = buildCardioSession({ date: '2026-11-24', location: 'gym', minutes, equipment: DEFAULT_HOME });
      const iv = hard.options.find((o) => o.title.startsWith('Intervallen'))!;
      expect(totalSeconds(iv.blocks!)).toBe(minutes * 60);
      expect(iv.blocks!.filter((b) => b.hard)).toHaveLength(10);
      const easy = buildCardioSession({ date: '2026-11-24', location: 'gym', minutes, readiness: 'orange', equipment: DEFAULT_HOME });
      expect(totalSeconds(easy.options[0]!.blocks!)).toBe(minutes * 60);
      expect(easy.options[0]!.blocks!.some((b) => b.hard)).toBe(false);
    }
  });

  it('een groepsles krijgt geen timer, het circuit thuis wel', () => {
    const c = buildCardioSession({ date: '2026-11-23', location: 'gym', minutes: 45, equipment: DEFAULT_HOME, groupClass: 'Indoor cycling' });
    expect(c.options).toHaveLength(1);
    expect(c.options[0]!.blocks).toBeUndefined();
    const home = buildCardioSession({ date: '2026-11-23', location: 'home', minutes: 30, equipment: DEFAULT_HOME });
    const sec = totalSeconds(home.options[0]!.blocks!);
    expect(sec).toBeLessThanOrEqual(30 * 60);
    expect(sec).toBeGreaterThanOrEqual(25 * 60);
  });

  it('de afsluiter na kracht heeft een timer van 6 minuten', () => {
    const s = buildStrengthSession({ date: '2026-11-24', template: 'A', location: 'gym', minutes: 60, history: [], equipment: DEFAULT_HOME });
    expect(s.finisher?.title).toBe('Afsluiter (6 min)');
    expect(totalSeconds(s.finisher!.blocks!)).toBe(360);
  });
});
