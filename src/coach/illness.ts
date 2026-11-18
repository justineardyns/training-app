import { diffDays } from './dates.ts';
import type { ISODate, SessionLog } from './types.ts';

// Ziek zijn. Vuistregel van coaches en sportartsen ("nekregel"):
// - enkel boven de nek (neus, keel): lichte training mag, geen intensiteit;
// - onder de nek of het hele lichaam (koorts, griep, maag-darm): rust tot je beter bent;
// - daarna rustig terug: de eerste 2 trainingen lichter.
// Geen diagnose: duurt het lang of wordt het erger → huisarts.

export type IllnessKind = 'verkouden' | 'griep' | 'koorts' | 'maag';

export const ILLNESS_LABEL: Record<IllnessKind, string> = {
  verkouden: 'Verkouden (neus, keel)',
  griep: 'Griep of hoesten op de borst',
  koorts: 'Koorts',
  maag: 'Maag-darm',
};

export interface IllnessUpdate {
  date: ISODate;
  trend: 'beter' | 'zelfde' | 'erger' | 'weg';
  kind?: IllnessKind;
}

export interface Illness {
  id: string;
  kind: IllnessKind;
  startedOn: ISODate;
  updates: IllnessUpdate[];
  resolvedOn?: ISODate;
}

export type IllnessStatus = 'none' | 'rest' | 'light' | 'return';

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
const FEVER_DAYS = 3;

export function currentKind(i: Illness): IllnessKind {
  return [...i.updates].reverse().find((u) => u.kind)?.kind ?? i.kind;
}

const restKinds = new Set<IllnessKind>(['griep', 'koorts', 'maag']);

export function illnessState(illnesses: Illness[], today: ISODate, history: SessionLog[] = []): IllnessState {
  const none: IllnessState = { status: 'none', message: '', refer: false, referMessage: '' };
  const active = illnesses.filter((i) => !i.resolvedOn && i.startedOn <= today).sort((a, b) => (a.startedOn < b.startedOn ? 1 : -1))[0];
  if (active) {
    const kind = currentKind(active);
    const days = diffDays(today, active.startedOn);
    const reasons: string[] = [];
    if (active.updates.some((u) => u.trend === 'erger')) reasons.push('het wordt erger');
    if (kind === 'koorts' && days >= FEVER_DAYS) reasons.push(`al ${days} dagen koorts`);
    if (days > LONG_DAYS) reasons.push(`al meer dan ${LONG_DAYS} dagen ziek`);
    const refer = reasons.length > 0;
    const referMessage = refer
      ? `Ga langs bij je huisarts (${reasons.join(', ')}). Ook meteen bij hoge koorts, pijn op de borst of als je moeilijk ademt.`
      : '';
    if (restKinds.has(kind)) {
      return {
        status: 'rest',
        illness: active,
        refer,
        referMessage,
        message: `${ILLNESS_LABEL[kind]}: rust. Geen training tot je beter bent: je lichaam heeft zijn energie nu nodig om te genezen. Tik "Genezen" als je 24 uur zonder koorts of klachten bent.`,
      };
    }
    return {
      status: 'light',
      illness: active,
      refer,
      referMessage,
      message: 'Verkouden (enkel boven de nek): trainen mag, maar lichter. Geen intervallen of les, wel rustig fietsen of lichter krachttrainen. Voel je je slechter tijdens de training: stoppen.',
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
        message: `Terug na ziekte: je ${since === 0 ? 'eerste 2 trainingen zijn' : 'volgende training is'} lichter. Rustig opbouwen, dan ben je sneller weer op niveau.`,
      };
    }
  }
  return none;
}
