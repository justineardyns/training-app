import { useEffect } from 'preact/hooks';
import { useRoute } from './router.ts';
import { useStore } from './hooks.ts';
import { Setup } from './screens/Setup.tsx';
import { Today } from './screens/Today.tsx';
import { untickedDays, Week } from './screens/Week.tsx';
import { Agenda } from './screens/Agenda.tsx';
import { Training } from './screens/Training.tsx';
import { More } from './screens/More.tsx';
import { Report } from './screens/Report.tsx';
import { InjuryReport } from './screens/Injury.tsx';
import { ExerciseInfo } from './screens/ExerciseInfo.tsx';

const TABS = [
  { route: 'vandaag', label: 'Vandaag', ico: '◉' },
  { route: 'training', label: 'Training', ico: '▶\uFE0E' },
  { route: 'week', label: 'Week', ico: '☰' },
  { route: 'agenda', label: 'Agenda', ico: '▦' },
  { route: 'rapport', label: 'Rapport', ico: '▲' },
  { route: 'meer', label: 'Meer', ico: '≡' },
] as const;

export function App() {
  const s = useStore();
  const { route, params } = useRoute();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route, params.join('/')]);

  if (!s.ready) return <div class="app splash" aria-busy="true" />;
  if (!s.profile()?.setupDone) return <Setup />;

  const today = s.today();
  const toTick = untickedDays(today, (d) => !!s.explicitDay(d)) >= 3;
  // Training bezig (of de stopwatch loopt): groen bolletje op de tab.
  const live = !!s.workout || !!s.local.freeCardio;
  const active = route === 'beschikbaarheid' ? 'agenda' : route === 'cardio' ? 'training' : route;
  let page;
  switch (route) {
    case 'week':
      page = <Week />;
      break;
    case 'agenda':
    case 'beschikbaarheid': // oude links (meldingen) gaan naar de Agenda
      page = <Agenda />;
      break;
    case 'training':
    case 'cardio': // oude links
      page = <Training />;
      break;
    case 'oefening':
      page = <ExerciseInfo key={params[0]} id={params[0] ?? ''} />;
      break;
    case 'blessure':
      page = <InjuryReport />;
      break;
    case 'rapport':
      page = <Report />;
      break;
    case 'meer':
      page = <More key={params[0] ?? 'root'} sub={params[0]} />;
      break;
    default:
      page = <Today />;
  }

  return (
    <div class="app">
      <main class="page">{page}</main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <a
            key={t.route}
            href={`#/${t.route}`}
            class={active === t.route ? 'on' : ''}
            aria-label={t.route === 'agenda' && toTick ? 'Agenda: vink je komende dagen aan' : t.route === 'training' && live ? 'Training: bezig' : undefined}
          >
            <span class="ico" aria-hidden="true">
              {t.ico}
              {t.route === 'agenda' && toTick && <span class="badge" />}
              {t.route === 'training' && live && <span class="badge live" />}
            </span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
