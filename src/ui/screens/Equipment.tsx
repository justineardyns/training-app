import { getExercise } from '../../coach/catalog.ts';
import { kg, loadOptions, round } from '../../coach/loads.ts';
import type { GymConfig, HomeEquipment } from '../../coach/types.ts';
import { Chips, Stepper } from '../components.tsx';

const PLATE_SIZES = [0.5, 1, 1.25, 1.5, 2, 2.5, 5, 10];
const HANDLES = [1, 1.5, 2, 2.5, 3];
const CONNECTORS = [0, 0.5, 1, 1.5, 2, 2.5];
const KETTLEBELLS = [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];

const nf = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 });

function rangeText(opts: number[]): string {
  if (opts.length === 0) return 'niet mogelijk';
  if (opts.length === 1) return kg(opts[0]!);
  return `${nf.format(opts[0]!)}–${kg(opts.at(-1)!)} in ${opts.length} stappen`;
}

export function HomeEquipmentEditor(props: { value: HomeEquipment; onChange: (v: HomeEquipment) => void }) {
  const eq = props.value;
  const count = (size: number) => eq.plates.find((p) => p.kg === size)?.count ?? 0;
  const setCount = (size: number, delta: number) => {
    const next = Math.max(0, Math.min(16, count(size) + delta * 2));
    const plates = [...eq.plates.filter((p) => p.kg !== size), ...(next > 0 ? [{ kg: size, count: next }] : [])].sort((a, b) => a.kg - b.kg);
    props.onChange({ ...eq, plates });
  };
  const toggleKb = (w: number) =>
    props.onChange({
      ...eq,
      kettlebellsKg: eq.kettlebellsKg.includes(w) ? eq.kettlebellsKg.filter((x) => x !== w) : [...eq.kettlebellsKg, w].sort((a, b) => a - b),
    });

  const pair = loadOptions(getExercise('rdl-db'), 'home', eq);
  const single = loadOptions(getExercise('goblet-squat'), 'home', eq);
  const bar = loadOptions(getExercise('rdl-homebar'), 'home', eq);

  return (
    <div class="stack">
      <div class="card">
        <h3>Lege dumbbell</h3>
        <p class="muted small">Gewicht van één handgreep met sluitingen.</p>
        <Chips options={HANDLES.map((h) => ({ value: h, label: kg(h) }))} value={eq.dumbbellHandleKg} onChange={(v) => props.onChange({ ...eq, dumbbellHandleKg: v })} wrap />
      </div>

      <div class="card">
        <h3>Schijven</h3>
        <p class="muted small">Hoeveel heb je in totaal? Altijd per paar.</p>
        {PLATE_SIZES.map((size) => (
          <div class="plate-row" key={size}>
            <span class="plate-label">{kg(size)}</span>
            <Stepper value={count(size)} suffix="st." onChange={(d) => setCount(size, d)} label={`Schijven van ${kg(size)}`} />
          </div>
        ))}
      </div>

      <div class="card">
        <h3>Verbindingsstuk (stang)</h3>
        <p class="muted small">Het stuk waarmee je de 2 dumbbells tot een stang koppelt. Ongeveer.</p>
        <Chips options={CONNECTORS.map((c) => ({ value: c, label: c === 0 ? 'geen' : kg(c) }))} value={eq.connectorKg} onChange={(v) => props.onChange({ ...eq, connectorKg: v })} wrap />
      </div>

      <div class="card">
        <h3>Kettlebell</h3>
        <Chips options={KETTLEBELLS.map((w) => ({ value: w, label: kg(w) }))} value={eq.kettlebellsKg} onChange={toggleKb} wrap />
      </div>

      <div class="card summary">
        <h3>Wat je daarmee kan</h3>
        <p>2 dumbbells: {pair.length ? `${rangeText(pair)} per hand` : 'niet mogelijk'}</p>
        <p>1 dumbbell: {rangeText(single)}</p>
        <p>Stang: {rangeText(bar)}</p>
        <p>Kettlebell: {eq.kettlebellsKg.length ? eq.kettlebellsKg.map(kg).join(', ') : 'geen'}</p>
      </div>
    </div>
  );
}

type DbStep = '1' | '2' | '2.5';

function dumbbellList(step: DbStep): number[] {
  if (step === '1') return [...Array.from({ length: 10 }, (_, i) => i + 1), ...Array.from({ length: 15 }, (_, i) => 12 + i * 2)];
  const s = Number(step);
  return Array.from({ length: Math.floor(40 / s) }, (_, i) => round((i + 1) * s));
}

function dbStepOf(gym: GymConfig): DbStep {
  if (gym.dumbbells.includes(7)) return '1';
  if (gym.dumbbells.includes(2.5) || gym.dumbbells.includes(7.5)) return '2.5';
  return '2';
}

export function GymEditor(props: { value: GymConfig; onChange: (v: GymConfig) => void }) {
  const gym = props.value;
  return (
    <div class="stack">
      <div class="card">
        <h3>Dumbbells in Jims</h3>
        <p class="muted small">Welke stappen staan er in het rek? Weet je het niet: laat op 2 kg.</p>
        <Chips<DbStep>
          options={[
            { value: '1', label: 'per 1 kg' },
            { value: '2', label: 'per 2 kg' },
            { value: '2.5', label: 'per 2,5 kg' },
          ]}
          value={dbStepOf(gym)}
          onChange={(v) => props.onChange({ ...gym, dumbbells: dumbbellList(v) })}
        />
      </div>
      <div class="card">
        <h3>Toestellen</h3>
        <Chips options={[{ value: 2.5, label: 'per 2,5 kg' }, { value: 5, label: 'per 5 kg' }]} value={gym.machineStep} onChange={(v) => props.onChange({ ...gym, machineStep: v })} />
      </div>
      <div class="card">
        <h3>Kabel</h3>
        <Chips options={[{ value: 2.5, label: 'per 2,5 kg' }, { value: 5, label: 'per 5 kg' }]} value={gym.cableStep} onChange={(v) => props.onChange({ ...gym, cableStep: v })} />
      </div>
    </div>
  );
}
