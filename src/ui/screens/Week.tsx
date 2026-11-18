import { useState } from 'preact/hooks';
import { gymOpen, isWeekend, slotOptions } from '../../coach/availability.ts';
import { addDays, DAY_SHORT, dayIndex } from '../../coach/dates.ts';
import type { PlannedDay, WeekPlan } from '../../coach/planner.ts';
import type { DayAvailability, Minutes, Slot } from '../../coach/types.ts';
import { templateTitle } from '../../coach/session.ts';
import { SWEAT_KINDS } from '../../coach/planner.ts';
import { Chips, Messages } from '../components.tsx';
import { WeatherBadge } from './CoachCards.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';

const STATUS_ICON: Record<PlannedDay['status'], string> = { done: '✓', planned: '●', moved: '↷', free: '' };

export function dayLabel(date: string): string {
  return `${DAY_SHORT[dayIndex(date)]} ${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
}

const MOMENT: Record<Slot, string> = { day: 'overdag', evening: "'s avonds" };

/** Rollend plan. Tik op een dag: waarom, en wisselen (kracht ↔ conditie) of "kan niet". */
export function PlanList(props: { plan: WeekPlan; today: string; className?: string; onChange?: (date: string, patch: Partial<DayAvailability>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const cls = props.className ?? 'Indoor cycling';
  return (
    <div class="plan">
      {props.plan.days.map((d) => {
        const actionable = !!props.onChange && d.status === 'planned' && d.sweat;
        const isOpen = open === d.date && actionable;
        return (
          <div key={d.date} class={`plan-day ${d.sweat ? 'sweat' : 'light'} ${d.status} ${d.date === props.today ? 'today' : ''} ${isOpen ? 'open' : ''}`}>
            <button
              class="plan-row"
              disabled={!actionable}
              aria-expanded={actionable ? isOpen : undefined}
              aria-label={actionable ? `${dayLabel(d.date)}: ${d.title}. Tik om te wisselen` : undefined}
              onClick={() => setOpen(isOpen ? null : d.date)}
            >
              <span class="plan-date">{d.date === props.today ? 'vandaag' : dayLabel(d.date)}</span>
              <span class="plan-title">
                {d.type === 'tennis' ? '🎾 ' : d.groupClass ? '🚴 ' : ''}
                {d.title}
                {d.slot && d.status === 'planned' && !d.time && <span class="muted small"> · {MOMENT[d.slot]}</span>}
                {d.lighter && <span class="pill orange">lichter</span>}
                {d.want && <span class="pill green">jouw keuze</span>}
                {d.why && <span class="why">{d.why}</span>}
              </span>
              <span class="plan-icon" aria-label={d.status}>
                {d.hair && d.status !== 'free' && (
                  <span class="hair" title="Haarwasdag" aria-label="haarwasdag">
                    🚿
                  </span>
                )}
                <WeatherBadge day={d} />
                {STATUS_ICON[d.status]}
              </span>
            </button>
            {isOpen && (
              <div class="plan-actions">
                {d.type === 'strength' && (
                  <button class="btn small" onClick={() => { props.onChange!(d.date, { want: 'cardio' }); setOpen(null); }}>
                    {d.classSlot ? `🚴 Liever ${cls.toLowerCase()}` : 'Liever conditie'}
                  </button>
                )}
                {d.type === 'cardio' && (
                  <button class="btn small" onClick={() => { props.onChange!(d.date, { want: 'strength' }); setOpen(null); }}>
                    🏋️ Liever kracht
                  </button>
                )}
                {d.want && (
                  <button class="btn small ghost" onClick={() => { props.onChange!(d.date, { want: undefined }); setOpen(null); }}>
                    ↺ Terug naar het voorstel
                  </button>
                )}
                {d.type === 'tennis' ? (
                  <button class="btn small ghost" onClick={() => { props.onChange!(d.date, { tennis: undefined }); setOpen(null); }}>
                    Tennis gaat niet door
                  </button>
                ) : (
                  <button class="btn small ghost" onClick={() => { props.onChange!(d.date, { slots: [], want: undefined }); setOpen(null); }}>
                    Kan niet die dag
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Hoeveel van de komende dagen (vanaf morgen) heb je nog niet aangevinkt? */
export function untickedDays(today: string, explicit: (d: string) => boolean): number {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i + 1)).filter((d) => !explicit(d)).length;
}

export function Week() {
  const s = useStore();
  const today = s.today();
  const plan = s.plan();
  const unticked = untickedDays(today, (d) => !!s.explicitDay(d));
  const past = s
    .sessions()
    .filter((x) => SWEAT_KINDS.has(x.kind) && x.date < today && x.date >= addDays(today, -7))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const inLast7 = past.length + plan.done;

  return (
    <>
      <h1>Komende 7 dagen</h1>
      {unticked >= 3 && (
        <button class="card cta" onClick={() => go('beschikbaarheid')}>
          <strong>Vink je komende dagen aan</strong>
          <span class="muted small">Welke avonden (en weekenddagen) passen? 20 seconden.</span>
        </button>
      )}
      <p class="muted small">
        <strong>
          {plan.planned + plan.done}/{plan.target} trainingen: {plan.strength}× kracht + {plan.cardio}× conditie
        </strong>
        {plan.deload.deload ? ' · deloadweek' : ''}
        <br />
        Conditie (🚿 haarwasdag) max 4 en nooit 2 dagen na elkaar · kracht max 4 · nooit benen naast {s.prefs().className.toLowerCase()}
      </p>
      <PlanList plan={plan} today={today} className={s.prefs().className} onChange={(date, patch) => s.updateDay(date, patch)} />
      <p class="muted small">Tik op een dag om te wisselen tussen kracht en {s.prefs().className.toLowerCase()}, of om ze te schrappen.</p>
      <Messages messages={plan.messages} />
      <button class="btn primary" onClick={() => go('beschikbaarheid')}>
        Dagen aanvinken
      </button>
      {past.length > 0 && (
        <>
          <h2>Afgelopen 7 dagen</h2>
          <p class="muted small">{inLast7} trainingen</p>
          <ul class="plain">
            {past.map((x) => (
              <li key={x.id}>
                <strong>{dayLabel(x.date)}</strong> {x.title ?? (x.kind === 'strength' ? templateTitle(x.template) : x.workoutType ?? 'Cardio')}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Eén scherm, enkel tikken: welke momenten passen de komende 7 dagen? */
export function Availability() {
  const s = useStore();
  const today = s.today();
  const prefs = s.prefs();
  const [days, setDays] = useState<DayAvailability[]>(() => Array.from({ length: 7 }, (_, i) => s.dayAvailability(addDays(today, i)).day));
  const [minutes, setMinutes] = useState<Minutes>(() => days[1]?.minutes ?? prefs.minutes);
  const [saving, setSaving] = useState(false);
  const set = (i: number, patch: Partial<DayAvailability>) => setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const toggleSlot = (i: number, slot: Slot) => {
    const cur = days[i]!.slots;
    set(i, { slots: cur.includes(slot) ? cur.filter((x) => x !== slot) : [...cur, slot] });
  };
  const count = days.filter((d) => d.slots.length > 0 || (d.tennis ?? 0) > 0).length;

  const save = async () => {
    setSaving(true);
    await s.saveAvailability(days.map((d) => ({ ...d, minutes })));
    if (minutes !== prefs.minutes) {
      const p = s.profile();
      if (p) await s.saveProfile({ ...p, prefs: { ...p.prefs, minutes } });
    }
    go('week');
  };

  return (
    <>
      <h1>Wanneer kan je?</h1>
      <p class="muted">Vink aan wat past de komende 7 dagen: weekdagen 's avonds, in het weekend overdag (Jims sluit dan om 17u). 🚴 = lesmoment {prefs.className.toLowerCase()}.</p>
      <div class="card">
        <h3>Tijd per training</h3>
        <Chips<Minutes>
          options={[
            { value: 30, label: '30 min' },
            { value: 45, label: '45 min' },
            { value: 60, label: '60 min' },
          ]}
          value={minutes}
          onChange={setMinutes}
        />
      </div>
      <div class="avail">
        {days.map((d, i) => {
          const tennisDay = prefs.tennisDays.includes(dayIndex(d.date));
          const playing = (d.tennis ?? 0) > 0;
          return (
            <div key={d.date} class="avail-day">
              <div class="avail-head">
                <strong>{i === 0 ? `Vandaag (${dayLabel(d.date)})` : dayLabel(d.date)}</strong>
                {prefs.trainAtHome && d.slots.length > 0 && !playing && (
                  <button class={`chip mini ${d.home ? 'on' : ''}`} aria-pressed={!!d.home} onClick={() => set(i, { home: !d.home })}>
                    🏠 thuis
                  </button>
                )}
              </div>
              <div class="chips" role="group" aria-label={`Momenten op ${dayLabel(d.date)}`}>
                {slotOptions(d.date, prefs.trainAtHome).map((slot) => {
                  const on = d.slots.includes(slot) && !playing;
                  const base = slot === 'day' ? 'Overdag' : isWeekend(d.date) && !gymOpen(d.date, 'evening') ? 'Avond · thuis' : 'Avond';
                  const lesson = prefs.classSlots.some((c) => c.day === dayIndex(d.date) && c.slot === slot);
                  const label = lesson ? `${base} · 🚴` : base;
                  return (
                    <button key={slot} class={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={playing} onClick={() => toggleSlot(i, slot)}>
                      {on ? '✓ ' : ''}
                      {label}
                    </button>
                  );
                })}
              </div>
              {tennisDay && (
                <Chips<number>
                  label={`Tennis op ${dayLabel(d.date)}`}
                  options={[
                    { value: 0, label: 'Geen tennis' },
                    { value: 60, label: '🎾 1u' },
                    { value: 120, label: '🎾 2u' },
                  ]}
                  value={d.tennis ?? 0}
                  onChange={(v) => set(i, { tennis: v || undefined })}
                />
              )}
            </div>
          );
        })}
      </div>
      <p class="muted small">
        {count === 0
          ? 'Niets aangevinkt: dan plan ik deze dagen niets.'
          : `Ik kies de beste momenten (max ${prefs.targetPerWeek}) en de mix kracht/conditie: conditie nooit 2 dagen na elkaar, geen benen naast ${prefs.className.toLowerCase()}.`}
      </p>
      <div class="sticky-actions">
        <button class="btn primary huge" disabled={saving} onClick={save}>
          Bewaar en plan
        </button>
      </div>
    </>
  );
}
