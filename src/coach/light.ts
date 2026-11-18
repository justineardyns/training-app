import type { WalkAdvice } from './weather.ts';

// Zweetvrije activiteiten voor de dagen tussen je trainingen. Allemaal optioneel.

export type LightId = 'mobiliteit' | 'wandeling' | 'core' | 'stretching' | 'rust';

export interface LightActivity {
  id: LightId;
  title: string;
  minutes: number;
  why: string;
  steps: string[];
}

export const LIGHT: Record<LightId, LightActivity> = {
  mobiliteit: {
    id: 'mobiliteit',
    title: 'Mobiliteit',
    minutes: 10,
    why: 'Soepele heupen, rug en schouders = betere techniek en minder pijntjes.',
    steps: [
      'Kat-koe: 8× traag',
      "World's greatest stretch: 5× per kant",
      '90/90-heupwissel: 6× per kant',
      'Borstwervel-rotatie op handen en knieën: 8× per kant',
      'Enkel naar de muur: 10× per kant',
      'Diepe squat vasthouden: 3× 20 s',
    ],
  },
  wandeling: {
    id: 'wandeling',
    title: 'Wandeling',
    minutes: 30,
    why: 'Extra beweging zonder te zweten: goed voor je herstel en je vetverlies.',
    steps: ['30 min stevig maar comfortabel wandelen; je kan nog vlot praten.'],
  },
  core: {
    id: 'core',
    title: 'Korte core (rustig)',
    minutes: 8,
    why: 'Sterke romp, rustig tempo: je zweet niet.',
    steps: ['Dead bug: 2× 8 per kant', 'Bird dog: 2× 8 per kant', 'Zijplank: 2× 20 s per kant', 'Rustig ademen, geen haast'],
  },
  rust: {
    id: 'rust',
    title: 'Rust en herstel',
    minutes: 0,
    why: 'Ziek: je lichaam heeft zijn energie nu nodig om te genezen. Rust is vandaag je training.',
    steps: ['Veel drinken (water, thee, soep)', 'Extra slapen', 'Geen training, ook geen zware wandeling', 'Voel je je 24 uur zonder koorts of klachten: tik "Genezen"'],
  },
  stretching: {
    id: 'stretching',
    title: 'Stretching',
    minutes: 10,
    why: 'Ontspannen na een trainingsdag.',
    steps: [
      'Hamstrings (staand, been op een trede): 2× 30 s per kant',
      'Heupbuigers (halve knieling): 2× 30 s per kant',
      'Borst in een deuropening: 2× 30 s',
      'Kuiten tegen de muur: 2× 30 s per kant',
      "Child's pose: 1 min",
    ],
  },
};

/** Suggestie voor een rustdag: na een krachtdag mobiliteit, anders afwisselend. */
export function lightFor(prevWasStrength: boolean, dayIdx: number): LightActivity {
  if (prevWasStrength) return LIGHT.mobiliteit;
  const rot: LightId[] = ['wandeling', 'core', 'wandeling', 'stretching'];
  return LIGHT[rot[dayIdx % rot.length]!];
}

/**
 * Met het weer erbij: droog → wandelen (ook na kracht: dat helpt je herstel), regen → binnen.
 * Zonder weerdata: zoals lightFor.
 */
export function chooseLight(prevWasStrength: boolean, dayIdx: number, walk?: WalkAdvice): { light: LightActivity; note?: string } {
  const base = lightFor(prevWasStrength, dayIdx);
  if (!walk) return { light: base };
  if (walk.verdict === 'goed') {
    const why = prevWasStrength
      ? `${walk.text} Wandelen na een krachtdag: je spieren herstellen sneller.`
      : `${walk.text} Ideaal om te wandelen.`;
    return { light: { ...LIGHT.wandeling, why }, note: walk.text };
  }
  if (walk.verdict === 'matig') {
    if (base.id === 'wandeling') return { light: { ...base, why: `${walk.text} Jas mee, of doe binnen stretching.` }, note: walk.text };
    return { light: base, note: walk.text };
  }
  if (base.id !== 'wandeling') return { light: base, note: walk.text };
  const indoor = prevWasStrength ? LIGHT.mobiliteit : dayIdx % 2 === 0 ? LIGHT.stretching : LIGHT.core;
  return { light: { ...indoor, why: `Slecht wandelweer (${walk.text.replace(/\.$/, '').toLowerCase()}): vandaag binnen. ${indoor.why}` }, note: walk.text };
}
