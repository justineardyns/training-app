import { diffDays } from './dates.ts';
import type { ISODate, SessionLog } from './types.ts';

// Ziek is ziek: hoe erg maakt niet uit. Rust tot je "Genezen" tikt, daarna de eerste 2 trainingen lichter.
// Geen diagnose: duurt het lang of wordt het erger → huisarts.

/** Oud veld (vroeger koos je verkouden/griep/…); nu genegeerd. */
export type IllnessKind = 'ziek' | 'verkouden' | 'griep' | 'koorts' | 'maag';

export interface IllnessUpdate {
  date: ISODate;
  trend: 'beter' | 'zelfde' | 'erger' | 'weg';
  kind?: IllnessKind;
}

export interface Illness {
  id: string;
  kind?: IllnessKind;
  startedOn: ISODate;
  updates: IllnessUpdate[];
  resolvedOn?: ISODate;
}

export type IllnessStatus = 'none' | 'rest' | 'return';

export interface IllnessState {
  status: IllnessStatus;
  illness?: Illness;
  /** Kort voor in de app. */
  message: string;
  /** Naar de huisarts? */
  refer: boolean;
  referMessage: string;
}

/** Hoe lang na herstel nog voorzichtig, en hoeveel trainingen lichter. */
export const RETURN_DAYS = 7;
export const RETURN_SESSIONS = 2;
const LONG_DAYS = 7;

export function illnessState(illnesses: Illness[], today: ISODate, history: SessionLog[] = []): IllnessState {
  const active = illnesses.filter((i) => !i.resolvedOn && i.startedOn <= today).sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))[0];
  if (active) {
    const days = diffDays(today, active.startedOn);
    const reasons: string[] = [];
    if (active.updates.some((u) => u.trend === 'erger')) reasons.push('het wordt erger');
    if (days > LONG_DAYS) reasons.push(`al meer dan ${LONG_DAYS} dagen ziek`);
    const refer = reasons.length > 0;
    return {
      status: 'rest',
      illness: active,
      refer,
      referMessage: refer ? `Ga langs bij je huisarts (${reasons.join(', ')}). Meteen bij hoge koorts, pijn op de borst of als je moeilijk ademt.` : '',
      message: 'Ziek: rust. Geen training tot je beter bent, je lichaam heeft zijn energie nu nodig om te genezen. Tik "Genezen" als je je 24 uur goed voelt.',
    };
  }
  // Net genezen: de eerste trainingen lichter.
  const last = illnesses.filter((i) => i.resolvedOn && i.resolvedOn <= today).sort((a, b) => (a.resolvedOn! < b.resolvedOn! ? 1 : -1))[0];
  if (last && diffDays(today, last.resolvedOn!) <= RETURN_DAYS) {
    const since = history.filter((s) => s.kind !== 'light' && s.date >= last.resolvedOn! && s.date < today).length;
    if (since < RETURN_SESSIONS) {
      return {
        status: 'return',
        illness: last,
        refer: false,
        referMessage: '',
        message: `Terug na ziekte: je ${since === 0 ? 'eerste 2 trainingen zijn' : 'volgende training is'} rustiger. Rustig opbouwen, dan ben je sneller weer op niveau.`,
      };
    }
  }
  return { status: 'none', message: '', refer: false, referMessage: '' };
}
