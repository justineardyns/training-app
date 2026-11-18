import { DAY_SHORT } from '../../coach/dates.ts';
import type { ClassSlot, Prefs } from '../../coach/types.ts';
import { Chips } from '../components.tsx';

const CLASS_OPTIONS: ClassSlot[] = [
  ...[0, 1, 2, 3, 4].map((day): ClassSlot => ({ day, slot: 'evening' })),
  ...[5, 6].map((day): ClassSlot => ({ day, slot: 'day' })),
];
const key = (c: ClassSlot) => `${c.day}-${c.slot}`;

/** Voorkeuren voor je week: aantal sessies, verdeling, ervaring, lesmomenten en tennisdagen. */
export function PrefsEditor(props: { value: Prefs; onChange: (p: Prefs) => void; full?: boolean }) {
  const p = props.value;
  const set = (patch: Partial<Prefs>) => props.onChange({ ...p, ...patch, strengthPerWeek: Math.min(patch.targetPerWeek ?? p.targetPerWeek, patch.strengthPerWeek ?? p.strengthPerWeek) });
  return (
    <div class="stack">
      <div class="card">
        <h3>Ervaring met gewichten</h3>
        <Chips
          options={[
            { value: 'beginner', label: 'Absolute beginner' },
            { value: 'returning', label: 'Ik heb al getraind' },
          ]}
          value={p.experience}
          onChange={(v) => set({ experience: v })}
        />
        <p class="muted small">
          {p.experience === 'beginner'
            ? 'Je start licht, de eerste 2 keer per oefening max 2 sets om de beweging te leren, en in Jims eerst de toestellen.'
            : 'Gewone startgewichten en sets.'}
        </p>
      </div>
      <div class="card">
        <h3>Trainingen per 7 dagen</h3>
        <Chips
          options={[2, 3, 4].map((n) => ({ value: n, label: n === 4 ? '4 (max)' : String(n) }))}
          value={p.targetPerWeek}
          onChange={(v) => set({ targetPerWeek: v })}
        />
        <p class="muted small">Groepslessen en tennis tellen mee. Nooit twee dagen na elkaar.</p>
        <h3>Waarvan kracht</h3>
        <Chips
          options={[1, 2, 3].filter((n) => n <= p.targetPerWeek).map((n) => ({ value: n, label: `${n}× kracht` }))}
          value={p.strengthPerWeek}
          onChange={(v) => set({ strengthPerWeek: v })}
        />
        <p class="muted small">De rest is conditie: {p.className.toLowerCase()}, tennis of cardio.</p>
      </div>
      {props.full && (
        <div class="card">
          <h3>{p.className}: wanneer zijn er lessen?</h3>
          <div class="chips wrap" role="group" aria-label="Lesmomenten">
            {CLASS_OPTIONS.map((c) => {
              const on = p.classSlots.some((x) => key(x) === key(c));
              return (
                <button
                  key={key(c)}
                  class={`chip ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() => set({ classSlots: on ? p.classSlots.filter((x) => key(x) !== key(c)) : [...p.classSlots, c] })}
                >
                  {DAY_SHORT[c.day]} {c.slot === 'day' ? 'overdag' : 'avond'}
                </button>
              );
            })}
          </div>
          <h3>Tennis op</h3>
          <div class="chips wrap" role="group" aria-label="Tennisdagen">
            {DAY_SHORT.map((d, i) => {
              const on = p.tennisDays.includes(i);
              return (
                <button key={d} class={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set({ tennisDays: on ? p.tennisDays.filter((x) => x !== i) : [...p.tennisDays, i].sort() })}>
                  {d}
                </button>
              );
            })}
          </div>
          <p class="muted small">Op die dagen kan je bij "Dagen aanvinken" tennis (1u of 2u) aanduiden.</p>
        </div>
      )}
    </div>
  );
}
