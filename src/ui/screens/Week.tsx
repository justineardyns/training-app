import { useState } from 'preact/hooks';
import { addDays, DAY_SHORT, dayIndex } from '../../coach/dates.ts';
import { hourText, type PlannedDay, type WeekPlan } from '../../coach/planner.ts';
import type { DayAvailability, Slot } from '../../coach/types.ts';
import { templateTitle } from '../../coach/session.ts';
import { SWEAT_KINDS } from '../../coach/planner.ts';
import { Messages } from '../components.tsx';
import { WeatherBadge } from './CoachCards.tsx';
import { useStore } from '../hooks.ts';

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
        const actionable = !!props.onChange && ((d.status === 'planned' && d.sweat) || (!!d.want && d.status !== 'done'));
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
                {d.booked ? (
                  <span class="pill green">🎟️ gereserveerd</span>
                ) : (
                  d.want && (d.sweat ? <span class="pill green">jouw keuze</span> : <span class="pill orange">keuze past niet</span>)
                )}
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
                {d.groupClass && !d.booked && (
                  <button class="btn small" onClick={() => { props.onChange!(d.date, { booked: true }); setOpen(null); }}>
                    🎟️ Les gereserveerd
                  </button>
                )}
                {d.type === 'cardio' && !d.booked && (
                  <button class="btn small" onClick={() => { props.onChange!(d.date, { want: 'strength' }); setOpen(null); }}>
                    🏋️ Liever kracht
                  </button>
                )}
                {d.booked && (
                  <button class="btn small ghost" onClick={() => { props.onChange!(d.date, { booked: undefined }); setOpen(null); }}>
                    Reservatie geschrapt
                  </button>
                )}
                {d.want && !d.booked && (
                  <button class="btn small ghost" onClick={() => { props.onChange!(d.date, { want: undefined, booked: undefined }); setOpen(null); }}>
                    ↺ Terug naar het voorstel
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

/** Lessen zitten snel vol: welke van de komende 14 dagen moet je nog reserveren? Eén tik als het gelukt is. */
export function BookingCard() {
  const s = useStore();
  const classes = s.upcomingClasses();
  const open = classes.filter((d) => !d.booked);
  if (classes.length === 0) return null;
  return (
    <div class="card booking">
      <h3>{open.length ? `Reserveer je ${s.prefs().className.toLowerCase()}` : `Al je lessen zijn gereserveerd 🎟️`}</h3>
      {open.length > 0 && <p class="muted small">Lessen zitten snel vol. Reserveer in de Jims-app en tik hier aan wat lukte: die les blijft dan vast staan.</p>}
      <div class="chips wrap" role="group" aria-label="Lessen om te reserveren">
        {classes.map((d) => (
          <button
            key={d.date}
            class={`chip ${d.booked ? 'on' : ''}`}
            aria-pressed={!!d.booked}
            onClick={() => s.updateDay(d.date, { booked: d.booked ? undefined : true })}
          >
            {d.booked ? '✓ ' : ''}
            {dayLabel(d.date)} · {d.time ? hourText(d.time) : MOMENT[d.slot ?? 'evening']}
          </button>
        ))}
      </div>
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
  const ahead = s.planAhead();
  const plan = ahead.first;
  const past = s
    .sessions()
    .filter((x) => SWEAT_KINDS.has(x.kind) && x.date < today && x.date >= addDays(today, -7))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const inLast7 = past.length + plan.done;

  return (
    <>
      <h1>Komende 7 dagen</h1>
      <p class="muted small">
        <strong>
          {plan.planned + plan.done}/{plan.target} trainingen: {plan.strength}× kracht + {plan.cardio}× conditie
        </strong>
        {plan.deload.deload ? ' · deloadweek' : ''}
        <br />
        Conditie (🚿 haarwasdag) max 4 en nooit 2 dagen na elkaar · kracht max 4 · benen een rustdag na {s.prefs().className.toLowerCase()}
      </p>
      <PlanList plan={plan} today={today} className={s.prefs().className} onChange={(date, patch) => s.updateDay(date, patch)} />
      <p class="muted small">Tik op een dag om te wisselen tussen kracht en {s.prefs().className.toLowerCase()}. Wanneer je kan, duid je aan in de Agenda.</p>
      <Messages messages={plan.messages} />
      <p class="muted small">De week erna (voorlopig) en je lessen reserveren: zie de Agenda.</p>
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
