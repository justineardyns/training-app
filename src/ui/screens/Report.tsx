import { addDays, weekStart } from '../../coach/dates.ts';
import { buildReport } from '../../coach/report.ts';
import { useStore } from '../hooks.ts';

export function Report() {
  const s = useStore();
  const monday = weekStart(s.today());
  const plan = s.plan(monday);
  const report = buildReport({
    monday,
    history: s.sessions(),
    health: s.healthDays(),
    planned: s.availability(monday).file?.planned.length ?? plan.target,
    nextWeek: s.plan(addDays(monday, 7)),
  });
  return (
    <>
      <h1>Rapport</h1>
      <div class="card coach">
        <p>{report.message}</p>
      </div>
      <div class="card">
        <p>
          <strong>
            {report.done}/{report.planned}
          </strong>{' '}
          sessies deze week · streak {report.streak} {report.streak === 1 ? 'week' : 'weken'}
        </p>
      </div>
    </>
  );
}
