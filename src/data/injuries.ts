import type { Illness, IllnessKind } from '../coach/illness.ts';
import type { Injury, Severity, Zone } from '../coach/types.ts';
import { paths, type InjuriesFile } from './schema.ts';
import { newId, type Store } from './store.ts';

// "Ik heb last van…": melden en opvolgen.

export async function reportInjury(store: Store, zone: Zone, severity: Severity, sharp: boolean): Promise<Injury> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  const active = file.injuries.find((i) => i.zone === zone && !i.resolvedOn);
  let injury: Injury;
  if (active) {
    injury = { ...active, sharp: active.sharp || sharp, updates: [...active.updates, { date: today, trend: severity > active.severity ? 'erger' : 'zelfde', severity }] };
  } else {
    injury = { id: newId(), zone, severity, startedOn: today, sharp, updates: [] };
  }
  await store.write(paths.injuries, { ...file, injuries: [...file.injuries.filter((i) => i.id !== injury.id), injury] });
  return injury;
}

export async function updateInjury(store: Store, id: string, trend: 'beter' | 'zelfde' | 'erger' | 'weg'): Promise<void> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  await store.write(paths.injuries, {
    ...file,
    injuries: file.injuries.map((i) => {
      if (i.id !== id) return i;
      const last = i.updates.at(-1)?.severity ?? i.severity;
      const severity = (trend === 'beter' ? Math.max(1, last - 1) : trend === 'erger' ? Math.min(3, last + 1) : last) as Severity;
      return {
        ...i,
        updates: [...i.updates.filter((u) => u.date !== today), { date: today, trend, severity }],
        resolvedOn: trend === 'weg' ? today : i.resolvedOn,
      };
    }),
  });
}

/** "Ik ben ziek": één actieve ziekte tegelijk. */
export async function reportIllness(store: Store, kind: IllnessKind): Promise<Illness> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  const list = file.illnesses ?? [];
  const active = list.find((i) => !i.resolvedOn);
  const illness: Illness = active
    ? { ...active, updates: [...active.updates.filter((u) => u.date !== today), { date: today, trend: 'zelfde', kind }] }
    : { id: newId(), kind, startedOn: today, updates: [] };
  await store.write(paths.injuries, { ...file, illnesses: [...list.filter((i) => i.id !== illness.id), illness] });
  return illness;
}

export async function updateIllness(store: Store, id: string, trend: 'beter' | 'zelfde' | 'erger' | 'weg', kind?: IllnessKind): Promise<void> {
  const today = store.today();
  const file = store.read<InjuriesFile>(paths.injuries) ?? { injuries: [] };
  await store.write(paths.injuries, {
    ...file,
    illnesses: (file.illnesses ?? []).map((i) =>
      i.id !== id
        ? i
        : {
            ...i,
            updates: [...i.updates.filter((u) => u.date !== today), kind ? { date: today, trend, kind } : { date: today, trend }],
            resolvedOn: trend === 'weg' ? today : i.resolvedOn,
          },
    ),
  });
}
