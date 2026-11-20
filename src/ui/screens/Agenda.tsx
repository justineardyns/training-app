import { useState } from 'preact/hooks';
import { isWeekend, resolveDay } from '../../coach/availability.ts';
import { addDays, DAY_SHORT, dayIndex, dayName } from '../../coach/dates.ts';
import { hourText, SWEAT_KINDS, type PlannedDay } from '../../coach/planner.ts';
import type { ISODate, Minutes, SessionLog } from '../../coach/types.ts';
import { Chips } from '../components.tsx';
import { useStore } from '../hooks.ts';
import { go } from '../router.ts';
import { BookingCard } from './Week.tsx';

// Agenda: een maandkalender. Eén tik = groen (kan) of rood (kan niet). Je ziet meteen wat er gepland staat.

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function monthStart(date: ISODate, offset: number): ISODate {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + offset, 1));
  return t.toISOString().slice(0, 10);
}

/** Wat je die dag deed (voorbije dagen). */
function doneIcon(list: SessionLog[] | undefined): string {
  if (!list?.length) return '';
  if (list.some((s) => /tennis/i.test(`${s.title ?? ''} ${s.workoutType ?? ''}`))) return '🎾';
  if (list.some((s) => s.kind === 'strength')) return '🏋️';
  return '🚴';
}

function icon(d: PlannedDay | undefined): string {
  if (!d) return '';
  if (d.status === 'done') return '✓';
  if (d.light?.id === 'klusjes') return '🧹';
  if (!d.sweat) return '';
  if (d.type === 'tennis') return '🎾';
  if (d.type === 'cardio') return d.booked ? '🎟️' : '🚴';
  return '🏋️';
}

export function Agenda() {
  const s = useStore();
  const today = s.today();
  const prefs = s.prefs();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ISODate>(today);
  const ahead = s.planAhead();
  const doneOn = new Map<ISODate, SessionLog[]>();
  for (const x of s.sessions().filter((x) => SWEAT_KINDS.has(x.kind))) doneOn.set(x.date, [...(doneOn.get(x.date) ?? []), x]);
  const planned = new Map([...ahead.first.days, ...ahead.second.days].map((d) => [d.date, d]));
  const first = monthStart(today, offset);
  const lead = dayIndex(first);
  const daysInMonth = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate();
  const cells: (ISODate | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);

  const state = (date: ISODate) => {
    const { day, source } = s.dayAvailability(date);
    const can = resolveDay(day, prefs.trainAtHome).available || (day.tennis ?? 0) > 0;
    return { day, source, can };
  };
  const toggle = async (date: ISODate) => {
    setSelected(date);
    const { can } = state(date);
    await s.updateDay(date, can ? { slots: [], tennis: undefined, want: undefined, booked: undefined } : { slots: [isWeekend(date) ? 'day' : 'evening'] });
  };
  // Alles wat nog je vaste patroon volgt in de komende 14 dagen in één tik bevestigen (zo vraagt de coach het niet meer).
  const open14 = Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter((d) => state(d).source !== 'saved');
  const confirmRest = () => s.saveAvailability(open14.map((d) => state(d).day));

  const sel = state(selected);
  const selPlan = planned.get(selected);
  const tennisDay = prefs.tennisDays.includes(dayIndex(selected));
  const label = (d: ISODate) => `${DAY_SHORT[dayIndex(d)]} ${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  // Wat je deze maand al deed.
  const monthDone = [...doneOn].filter(([d]) => d.startsWith(first.slice(0, 7)) && d <= today).flatMap(([, l]) => l);
  const nTennis = monthDone.filter((x) => /tennis/i.test(`${x.title ?? ''} ${x.workoutType ?? ''}`)).length;
  const nStrength = monthDone.filter((x) => x.kind === 'strength').length;
  const nClass = monthDone.length - nTennis - nStrength;

  return (
    <>
      <h1>Agenda</h1>
      <p class="muted">Tik op een dag: groen = je kan trainen ('s avonds, in het weekend overdag), rood = kan niet.</p>
      <div class="row-between cal-nav">
        <button class="btn small ghost" disabled={offset <= -6} onClick={() => setOffset(offset - 1)} aria-label="Vorige maand">
          ‹
        </button>
        <h2 class="center">
          {MONTHS[Number(first.slice(5, 7)) - 1]} {first.slice(0, 4)}
        </h2>
        <button class="btn small ghost" disabled={offset >= 2} onClick={() => setOffset(offset + 1)} aria-label="Volgende maand">
          ›
        </button>
      </div>
      {monthDone.length > 0 && (
        <p class="muted small month-done">
          <strong>
            {offset === 0 ? 'Deze maand' : 'Die maand'}: {monthDone.length} {monthDone.length === 1 ? 'training' : 'trainingen'}
          </strong>
          {nStrength ? ` · ${nStrength}× kracht` : ''}
          {nClass ? ` · ${nClass}× ${prefs.className.toLowerCase()}` : ''}
          {nTennis ? ` · ${nTennis}× tennis` : ''}
        </p>
      )}
      <div class="cal" role="grid" aria-label="Maandkalender">
        {DAY_SHORT.map((d) => (
          <span key={d} class="cal-head" role="columnheader">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} class="cal-cell empty" />;
          const past = d < today;
          const st = state(d);
          const p = planned.get(d);
          const did = doneOn.get(d);
          const cls = `${past ? 'past' : st.can ? 'can' : 'cannot'}${did ? ' done' : ''}${p?.provisional ? ' provisional' : ''}`;
          return (
            <button
              key={d}
              role="gridcell"
              class={`cal-cell ${cls} ${st.source === 'saved' ? 'saved' : 'pattern'} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}`}
              disabled={past}
              aria-pressed={!past && st.can}
              aria-label={`${dayName(d)} ${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}: ${did ? 'gedaan' : past ? 'voorbij' : st.can ? 'kan' : 'kan niet'}${p?.sweat && !did ? `, ${p.title}` : ''}`}
              onClick={() => toggle(d)}
            >
              <span class="cal-num">{Number(d.slice(8))}</span>
              <span class="cal-ico" aria-hidden="true">
                {doneIcon(did) || (past ? '' : icon(p) || (st.can ? '✓' : '✕'))}
              </span>
            </button>
          );
        })}
      </div>
      <p class="muted small cal-legend">
        <span class="dot can" /> kan · <span class="dot cannot" /> kan niet · <span class="dot done" /> gedaan · gestreept = nog niet aangevinkt (je vaste patroon) · 🏋️ kracht · 🚴 les ·
        🎟️ gereserveerd · 🎾 tennis · 🧹 klusjes · iconen vanaf dag 8 zijn voorlopig
      </p>

      {selected >= today && (
        <div class="card agenda-detail">
          <h3>
            {dayName(selected)} {label(selected).split(' ')[1]}
          </h3>
          <div class="chips" role="group" aria-label={`Kan je op ${label(selected)}?`}>
            <button class={`chip ${sel.can ? 'on' : ''}`} aria-pressed={sel.can} onClick={() => !sel.can && toggle(selected)}>
              ✓ Kan {isWeekend(selected) ? 'overdag' : "'s avonds"}
            </button>
            <button class={`chip ${!sel.can ? 'on red' : ''}`} aria-pressed={!sel.can} onClick={() => sel.can && toggle(selected)}>
              ✕ Kan niet
            </button>
          </div>
          {sel.can && !(sel.day.tennis ?? 0) && (
            <Chips<Minutes>
              label={`Tijd op ${label(selected)}`}
              options={[
                { value: 30, label: '30 min' },
                { value: 45, label: '45 min' },
                { value: 60, label: '60 min' },
              ]}
              value={sel.day.minutes}
              onChange={(v) => s.updateDay(selected, { minutes: v })}
            />
          )}
          {tennisDay && (
            <Chips<number>
              label={`Tennis op ${label(selected)}`}
              options={[
                { value: 0, label: 'Geen tennis' },
                { value: 60, label: '🎾 1u' },
                { value: 120, label: '🎾 2u' },
              ]}
              value={sel.day.tennis ?? 0}
              onChange={(v) => s.updateDay(selected, v ? { tennis: v, slots: sel.day.slots.length ? sel.day.slots : ['evening'] } : { tennis: undefined })}
            />
          )}
          {selPlan?.sweat && selPlan.status === 'planned' && (
            <>
              <p>
                <strong>Gepland:</strong> {selPlan.title}
                {selPlan.provisional ? ' (voorlopig)' : ''}
              </p>
              {selPlan.why && <p class="why">{selPlan.why}</p>}
              {selPlan.walkExtra && (
                <p class="walk goed">
                  🚶 + wandeling{selPlan.walkExtra.bestHour !== undefined ? ` rond ${selPlan.walkExtra.bestHour}u` : ''}: droogste dag van de week
                </p>
              )}
              {selPlan.groupClass && (
                <button class={`btn small ${selPlan.booked ? '' : 'primary'}`} onClick={() => s.updateDay(selected, { booked: selPlan.booked ? undefined : true })}>
                  {selPlan.booked ? '✓ Gereserveerd (tik om te schrappen)' : `🎟️ Les gereserveerd${selPlan.time ? ` (${hourText(selPlan.time)})` : ''}`}
                </button>
              )}
            </>
          )}
          {selPlan && !selPlan.sweat && sel.can && <p class="muted small">Rustdag in het plan: {selPlan.light?.title.toLowerCase() ?? 'rust'}.</p>}
          {sel.source !== 'saved' && <p class="muted small">Nog niet aangevinkt: dit volgt je vaste patroon van vorige weken.</p>}
        </div>
      )}

      <BookingCard />

      <div class="stack">
        {open14.length > 0 && (
          <button class="btn primary" onClick={confirmRest}>
            ✓ De komende 14 dagen kloppen ({open14.length} {open14.length === 1 ? 'dag' : 'dagen'} bevestigen)
          </button>
        )}
        <button class="btn ghost" onClick={() => go('week')}>
          Naar je planning
        </button>
      </div>
    </>
  );
}
