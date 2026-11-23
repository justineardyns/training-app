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

- Harde planningsregels worden afgedwongen in `src/coach/planner.ts` en gecontroleerd door `src/coach/rules.ts`.
  Elke wijziging daaraan: fuzz-test groen houden. Ze gelden per rollend venster van 7 dagen:
  - max 6 trainingen, één per dag;
  - conditie (haarwasdag) max 4 en nooit 2 dagen na elkaar;
  - kracht max 4;
  - geen benen (full body of benen & romp) de dag vóór of ná indoor cycling of andere conditie die zwaar is voor de
    benen; enige uitzondering: een les die je zelf koos/reserveerde na een gedane benentraining;
  - tennis is geen harde regel: de dag erna liefst bovenlichaam (zachte voorkeur), herstel in gradaties via
    `recovery.ts` (1u → benen en romp 'herstelt', 2u → 'moe'); spinning (groepsles, `kind: 'class'`) → benen 'moe' en
    duwen (push-ups op het stuur: triceps) 'herstelt' de dag erna;
  - twee krachtdagen na elkaar enkel bovenlichaam ↔ benen;
  - minstens één beschikbare dag per 7 dagen vrij voor klusjes (liefst weekend), tenzij je elke dag zelf vastlegde.
- Rustdagen: hoogstens één wandeling per 7 dagen, op de droogste dag (`WalkAdvice.score`; rustdag krijgt +10 voorrang);
  is de droogste dag een trainingsdag, dan `walkExtra`. Zonder weerbericht: max 1 uit de afwisseling.
- Doel: het maximum (standaard 6, 1 rustdag; beginners bouwen op 4 → 5 → 6; 1 minder bij vaak moe), minstens 1× en
  liefst 2× indoor cycling, de rest kracht (minstens 2×). `planTwoWeeks` plant 14 dagen: dag 8–14 is voorlopig en
  bouwt verder op dag 1–7. `booked` (gereserveerde les) werkt als een vaste keuze voor conditie. Kracht: `A`/`B` full body, `U` bovenlichaam, `L` benen & romp.
- UI-teksten in Vlaams Nederlands, de gebruiker aanspreken met "je". Kort, direct, motiverend.
- **Geen uitleg over de planning of de regels in de UI** (geen "geen benen na tennis", geen meldingenblok, geen `why`
  tonen): dat is voor de coach. Uitleg hoort enkel bij de oefeningen (notities, tips, techniek). Enige meldingregel
  bovenaan Vandaag: `adjustments.focus` van /coach.
- Mobile-first, donker, grote tikdoelen (≥ 48 px, primaire acties ≥ 64 px). Zo weinig mogelijk typen.
- Buiten scope: voeding, calorieën, lichaamsgewicht, metingen. Apple Health staat voorlopig uit
  (`src/coach/health.ts` en `src/data/healthInbox.ts` blijven slapend klaar; niet aanroepen).
- Enkel gratis diensten. Weer: Open-Meteo vanop de iPhone (afgeronde coördinaten, cache enkel lokaal in IndexedDB,
  nooit in de privé-repo). Het weer beïnvloedt enkel zweetvrije dagen, nooit de keuze van zweetdagen.
- Ziek zijn (`src/coach/illness.ts`): ziek is ziek → rust (geen enkele training) tot "Genezen"; daarna de eerste
  2 trainingen rustiger (`gentle`: zonder extra uitleg). Huisarts bij > 7 dagen of erger. Bewaard in `data/injuries.json` (`illnesses`).
- Krachtcheck (`src/coach/check.ts`): in de week net voor de ritme-deload (`weeksSinceDeload === deloadEvery − 2`)
  krijgen hoofdoefeningen met ≥ 2 echte keren `prescription.test` (laatste set zoveel mogelijk reps).
- Tennis-extra (`tennisExtra`): ±1× per 7 dagen als je tennisdagen hebt, liefst bij `U`; oefeningen met `prehab`
  zijn nooit een vervanger voor gewone oefeningen.
- Mijlpalen (`src/coach/milestones.ts`), opwarming (`warmupFor`), spierpijn in gradaties (`sore` = echt,
  `soreLight` = een beetje).
- Timers (`src/coach/timer.ts`, UI in `src/ui/IntervalTimer.tsx`): cardio-opties en de afsluiter hebben `blocks`
  (opgeteld = de gekozen duur; groepsles: geen timer), `HoldTimer` voor `ex.timed` vinkt de set zelf af, `Elapsed`
  = oplopende trainingsklok. Piepjes worden vooruit gepland (`scheduleBeeps`), want iOS vertraagt JS-timers.
- Tab **Training** (`src/ui/screens/Training.tsx`): kracht als lijst (`Workout.tsx`) met ▶ Start / ■ Stop per oefening
  (`startItem`/`stopItem`/`finishItem`/`finishWorkout` in `src/data/workout.ts`, klok per oefening), vrije volgorde.
  Groepsles = altijd 1 uur (`CLASS_MINUTES`), geen timer; `ClassActions` (gedaan / niet gedaan / liever kracht) en
  `WishNote` (↺ terug, of kort zeggen dat een keuze niet past) op Vandaag en Training. Rustdag (enkel als je die dag
  vrij bent, niet ziek, dagvorm niet rood): `TrainAnyway` / Week → `store.trainAnyway` = `want: 'strength'`; de planner
  houdt het doel (opbouw) en schuift een andere training op. Losse cardio (`FreeCardio`) met stopwatch in `LocalSettings.freeCardio`,
  enkel aangeboden op een geplande conditiedag.
- Herstel (`src/coach/recovery.ts`) en sterke/werkpunten (`src/coach/insights.ts`) sturen de planner en de sessies;
  elke geplande dag krijgt een `why` (intern: tests, /coach; niet in de UI). `plan.messages` idem.

## Commando's

```bash
npm test          # vitest (unit)
npm run e2e       # playwright (iPhone-formaat, Chromium)
npm run typecheck
npm run build     # incl. dist/coach-cli.mjs
```
