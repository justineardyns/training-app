import { useRoute } from './router.ts';

const TABS = [
  { route: 'vandaag', label: 'Vandaag', ico: '◉' },
  { route: 'week', label: 'Week', ico: '▦' },
  { route: 'rapport', label: 'Rapport', ico: '▲' },
  { route: 'meer', label: 'Meer', ico: '≡' },
] as const;

export function App() {
  const { route } = useRoute();
  return (
    <div class="app">
      <main class="page">
        <h1>{TABS.find((t) => t.route === route)?.label ?? 'Coach'}</h1>
        <div class="card">
          <p>Je coach wordt gebouwd. Deze lege versie werkt al offline en kan op je beginscherm.</p>
          <p class="muted small">Tik in Safari op Deel → Zet op beginscherm.</p>
        </div>
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <a key={t.route} href={`#/${t.route}`} class={route === t.route ? 'on' : ''}>
            <span class="ico" aria-hidden="true">{t.ico}</span>
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
