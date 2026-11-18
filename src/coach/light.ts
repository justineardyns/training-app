// Zweetvrije activiteiten voor de dagen tussen je trainingen. Allemaal optioneel.

export type LightId = 'mobiliteit' | 'wandeling' | 'core' | 'stretching';

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
