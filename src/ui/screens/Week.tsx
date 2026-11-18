import { useState } from 'preact/hooks';
import { addDays, DAY_SHORT, dayIndex, isoWeek, weekStart } from '../../coach/dates.ts';
import type { PlannedDay, WeekPlan } from '../../coach/planner.ts';
import type { DayAvailability, Location, Minutes } from '../../coach/types.ts';
import { paths } from '../../data/schema.ts';
import { Chips, Messages } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';

const STATUS_ICON: Record<PlannedDay['status'], string> = { done: '✓', planned: '●', missed: '✕', moved: '↷', free: '' };

export function dayLabel(date: string): string {
  return `${DAY_SHORT[dayIndex(date)]} ${Number(date.slice(8))}/${Number(date.slice(5, 7))}`;
}

export function PlanList(props: { plan: WeekPlan; today: string }) {
  return (
    <div class="plan">
      {props.plan.days.map((d) => (
        <div key={d.date} class={`plan-day ${d.sweat ? 'sweat' : 'light'} ${d.status} ${d.date === props.today ? 'today' : ''}`}>
          <span class="plan-date">{dayLabel(d.date)}</span>
          <span class="plan-title">
            {d.title}
            {d.lighter && <span class="pill orange">lichter</span>}
          </span>
          <span class="plan-icon" aria-label={d.status}>
            {STATUS_ICON[d.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Moet je je beschikbaarheid voor volgende week nog ingeven? (vanaf vrijdag) */
export function needsNextWeek(today: string, has: (path: string) => boolean): string | undefined {
  if (dayIndex(today) < 4) return undefined;
  const next = addDays(weekStart(today), 7);
  return has(paths.availability(isoWeek(next))) ? undefined : next;
}

export function Week() {
  const s = useStore();
  const today = s.today();
  const thisMonday = weekStart(today);
  const [which, setWhich] = useState<'now' | 'next'>(dayIndex(today) === 6 ? 'next' : 'now');
  const monday = which === 'now' ? thisMonday : addDays(thisMonday, 7);
  const plan = s.plan(monday);
  const av = s.availability(monday);
  const missingNext = needsNextWeek(today, (p) => !!s.read(p));

  return (
    <>
      <h1>Week</h1>
      <Chips
        options={[
          { value: 'now', label: 'Deze week' },
          { value: 'next', label: 'Volgende week' },
        ]}
        value={which}
        onChange={setWhich}
      />
      {missingNext && which === 'now' && (
        <button class="card cta" onClick={() => go(`beschikbaarheid/${missingNext}`)}>
          <strong>Plan volgende week</strong>
          <span class="muted small">Tik welke dagen je kan. 20 seconden.</span>
        </button>
      )}
      <p class="muted small">
        {plan.done + plan.planned}/{plan.target} sessies · {isoWeek(monday)}
        {plan.deload.deload ? ' · deloadweek' : ''}
      </p>
      <PlanList plan={plan} today={today} />
      <Messages messages={plan.messages} />
      <button class="btn" onClick={() => go(`beschikbaarheid/${monday}`)}>
        {av.source === 'saved' ? 'Beschikbaarheid aanpassen' : 'Beschikbaarheid ingeven'}
      </button>
    </>
  );
}

type DayChoice = 'no' | Location;

export function Availability(props: { monday: string }) {
  const s = useStore();
  const [days, setDays] = useState<DayAvailability[]>(() => s.availability(props.monday).days);
  const [saving, setSaving] = useState(false);
  const today = s.today();
  const set = (i: number, patch: Partial<DayAvailability>) => setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const count = days.filter((d) => d.available).length;

  const save = async () => {
    setSaving(true);
    await s.saveAvailability(props.monday, days);
    go('week');
  };

  return (
    <>
      <h1>Wanneer kan je?</h1>
      <p class="muted">Week {isoWeek(props.monday).slice(6)} · tik per dag waar en hoelang.</p>
      <div class="avail">
        {days.map((d, i) => {
          const past = d.date < today;
          const choice: DayChoice = d.available ? d.location : 'no';
          return (
            <div key={d.date} class={`avail-day ${past ? 'past' : ''}`}>
              <div class="avail-head">
                <strong>{dayLabel(d.date)}</strong>
              </div>
              <Chips<DayChoice>
                label={`Waar op ${dayLabel(d.date)}`}
                options={[
                  { value: 'no', label: 'Kan niet' },
                  { value: 'gym', label: 'Jims' },
                  { value: 'home', label: 'Thuis' },
                ]}
                value={choice}
                onChange={(v) => set(i, v === 'no' ? { available: false } : { available: true, location: v })}
              />
              {d.available && (
                <Chips<Minutes>
                  label={`Tijd op ${dayLabel(d.date)}`}
                  options={[
                    { value: 30, label: '30 min' },
                    { value: 45, label: '45 min' },
                    { value: 60, label: '60 min' },
                  ]}
                  value={d.minutes}
                  onChange={(v) => set(i, { minutes: v })}
                />
              )}
            </div>
          );
        })}
      </div>
      <p class="muted small">{count < 3 ? `Met ${count} ${count === 1 ? 'dag' : 'dagen'} plan ik er zoveel als binnen de regels past.` : 'Ik kies de beste dagen, nooit twee na elkaar.'}</p>
      <div class="sticky-actions">
        <button class="btn primary huge" disabled={saving} onClick={save}>
          Bewaar en plan
        </button>
      </div>
    </>
  );
}
