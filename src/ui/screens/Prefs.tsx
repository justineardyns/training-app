import { DAY_SHORT } from '../../coach/dates.ts';
import type { ClassSlot, Minutes, Prefs } from '../../coach/types.ts';
import { Chips } from '../components.tsx';

const CLASS_OPTIONS: ClassSlot[] = [
  ...[0, 1, 2, 3, 4].map((day): ClassSlot => ({ day, slot: 'evening' })),
  ...[5, 6].map((day): ClassSlot => ({ day, slot: 'day' })),
];
const key = (c: ClassSlot) => `${c.day}-${c.slot}`;

/** Voorkeuren voor je week: aantal sessies, verdeling, ervaring, lesmomenten en tennisdagen. */
export function PrefsEditor(props: { value: Prefs; onChange: (p: Prefs) => void; full?: boolean }) {
  const p = props.value;
  const set = (patch: Partial<Prefs>) => props.onChange({ ...p, ...patch, rulesVersion: 2 });
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
        <h3>Standaard tijd per training</h3>
        <Chips<Minutes>
          options={[
            { value: 30, label: '30 min' },
            { value: 45, label: '45 min' },
            { value: 60, label: '60 min' },
          ]}
          value={p.minutes}
          onChange={(v) => set({ minutes: v })}
        />
        <h3>Maximum trainingen per 7 dagen</h3>
        <Chips
          options={[3, 4, 5, 6].map((n) => ({ value: n, label: n === 6 ? '6 (max)' : String(n) }))}
          value={p.targetPerWeek}
          onChange={(v) => set({ targetPerWeek: v })}
        />
        <p class="muted small">
          {p.targetPerWeek === 6 ? '1 vaste rustdag per 7 dagen. ' : ''}
          {p.className} minstens 1×, liefst 2× per week; de andere dagen kracht. Conditie (haarwasdag: {p.className.toLowerCase()}, tennis, cardio)
          max 4 en nooit 2 dagen na elkaar, kracht max 4. Na {p.className.toLowerCase()} krijgen je benen een rustdag.
        </p>
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
                  onClick={() =>
                    set({
                      classSlots: on
                        ? p.classSlots.filter((x) => key(x) !== key(c))
                        : [...p.classSlots, c.slot === 'day' ? { ...c, time: '10:00' } : c].sort((a, b) => a.day - b.day),
                    })
                  }
                >
                  {DAY_SHORT[c.day]} {c.slot === 'day' ? (p.classSlots.find((x) => key(x) === key(c))?.time ? 'om 10u' : 'overdag') : 'avond'}
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
        </div>
      )}
    </div>
  );
}
