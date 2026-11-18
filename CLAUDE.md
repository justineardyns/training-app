# training-app – ontwikkelnotities

Publieke repo met **enkel code** van de Coach-PWA. Persoonlijke data hoort hier nooit:
geen trainingslogs, Health-data, tokens, gebruikersnamen of e-mailadressen in code, tests of commits.
Tests gebruiken verzonnen data (`e2e/seed.ts`, `FakeGitHub`).

## Architectuur

- **Vite + Preact + TypeScript**, eigen service worker (`src/sw.ts`, precache + Web Push).
- `src/coach/`: **pure** coachlogica (geen I/O). Alles wat beslist (planner, regels, progressie, deload,
  dagvorm, blessures, rapport, Health-parsing) leeft hier en heeft unit tests.
- `src/data/`: `Store` spiegelt de bestanden van de privé-repo in IndexedDB; `sync.ts` pusht/pullt via de
  Git Data API (één commit per sync); `healthInbox.ts` verwerkt de export van de Opdracht; `push.ts`/`notify.ts`
  voor meldingen.
- `cli/coach-cli.ts`: gebundeld naar `dist/coach-cli.mjs` (op Pages), gebruikt door de meldingen-workflow
  in de privé-repo en door `/coach`.
- Hash-routing (`#/vandaag`, `#/week`, …) zodat Pages geen serverconfig nodig heeft.

## Regels

- Harde planningsregels (max 4 per rollend venster van 7 dagen, nooit twee zweetdagen na elkaar) worden afgedwongen in
  `src/coach/planner.ts` en gecontroleerd door `src/coach/rules.ts`. Elke wijziging daaraan: fuzz-test groen houden.
- UI-teksten in Vlaams Nederlands, de gebruiker aanspreken met "je". Kort, direct, motiverend.
- Mobile-first, donker, grote tikdoelen (≥ 48 px, primaire acties ≥ 64 px). Zo weinig mogelijk typen.
- Buiten scope: voeding, calorieën, lichaamsgewicht, metingen. Apple Health staat voorlopig uit
  (`src/coach/health.ts` en `src/data/healthInbox.ts` blijven slapend klaar; niet aanroepen).
- Enkel gratis diensten.

## Commando's

```bash
npm test          # vitest (unit)
npm run e2e       # playwright (iPhone-formaat, Chromium)
npm run typecheck
npm run build     # incl. dist/coach-cli.mjs
```
