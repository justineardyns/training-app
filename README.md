# Coach – je gratis personal trainer op je iPhone

Een app op je beginscherm die je trainingen plant, elke set vooraf invult en zelf bijstuurt.
Werkt offline in de gym, draait puur op jouw tikken en kost **€ 0**.

- **Vandaag:** wat je doet, één knop **Start**. Dagvorm met één tik: top / oké / moe / ziek of op.
- **Trainen (in Jims):** de app stelt per oefening een startgewicht en reps voor, per set één tik ✓,
  rusttimer start vanzelf. Na de oefening één tik: *Gelukt*, *Ik nam meer* of *Ik nam minder*
  (met het gewicht dat je nam). Daarmee bepaalt de app je volgende gewicht. "Toestel bezet",
  **foto's van elke oefening en elk toestel** (start- en eindpositie, ook offline), techniektips en uitlegvideo.
- **Absolute beginner:** lichte start, de eerste 2 keer per oefening max 2 sets om de beweging te leren,
  in Jims eerst de toestellen.
- **Slimme coach:** dubbele progressie, deloads, blessures ("Ik heb last van…"), flexibel herplannen
  bij een gemiste training of minder tijd.
- **Denkt mee als een personal coach:**
  - **Herstel per spiergroep:** benen, borst & schouders, rug & armen, romp. Kracht, indoor cycling en tennis
    tellen mee, net als je tik "spierpijn". Wat nog moe is, komt later in je training of krijgt een set minder
    en gaat niet zwaarder.
  - **Sterke punten en werkpunten:** wat gaat vooruit, wat staat stil, welke dagen vallen vaak weg, en neem je
    meer of minder dan voorgesteld. Je traagste spiergroep komt eerst in je training, en dagen die vaak wegvallen
    plant de coach liever niet.
  - **Bij elke dag een korte "waarom".** Tik op een dag om te wisselen tussen kracht en indoor cycling, of om
    ze te schrappen.
  - **Krachttrainingen in drie soorten:**
    - *Full body* als er de dag ervoor en erna geen indoor cycling is.
    - *Bovenlichaam* de dag vóór of na indoor cycling.
    - *Benen & romp* en *Bovenlichaam* om de beurt als je twee dagen na elkaar kracht doet.
- **Planning (Week):** de komende 7 dagen. De week erna zie je al voorlopig in de **Agenda** (zelfde regels, bouwt
  verder op de eerste week). Je vinkt aan welke avonden passen (in het weekend overdag, want Jims sluit dan om 17u), en of je
  tennist. Alles gebeurt in Jims: geen thuistrainingen.
- **Agenda** (eigen tab onderaan, de enige plek waar je je vrije dagen aanduidt): een maandkalender. Eén tik per dag:
  groen = kan, rood = kan niet, tot 2 maanden
  vooruit. Je ziet meteen wat er gepland staat (🏋️ 🚴 🎾 🎟️). Tik op een dag voor tennis of om een les als gereserveerd
  aan te duiden, of om de duur te kiezen (30/45/60 min). Met één knop bevestig je dat de komende 14 dagen kloppen.
  Een oranje bolletje op de tab = nog aan te duiden.
- **Lessen reserveren:** indoor cycling zit snel vol. In de **Agenda** zie je de lessen van de komende 14 dagen;
  reserveer in de Jims-app en tik aan wat lukte (🎟️). Een gereserveerde les blijft vast staan. Zondag krijg je
  een herinnering voor de lessen die nog niet gereserveerd zijn.
- **Harde regels:**
  - Max 6 trainingen per 7 dagen (1 rustdag), één training per dag. Als absolute beginner bouw je op:
    eerst 4, na 8 trainingen 5, na 16 trainingen 6.
  - **Conditie** (indoor cycling, tennis, cardio) is een haarwasdag 🚿: max 4 per 7 dagen en nooit 2 dagen na elkaar.
  - **Kracht**: max 4 per 7 dagen.
  - Nooit benen de dag vóór of ná indoor cycling: die dagen wordt het bovenlichaam (of rust). Voeg je een les toe
    of reserveer je er een, dan passen de dagen ervoor en erna zich aan.
  - Twee krachtdagen na elkaar wisselen bovenlichaam en benen & romp af.
  - Tennis speel je ontspannen: de dag erna mag je gewoon kracht doen.
  - 🧹 Elke 7 dagen blijft er minstens één moment vrij voor klusjes (liefst in het weekend, anders een avond).
  - Rustdagen: hoogstens één wandeling per week (op de droogste dag), verder mobiliteit, stretching of rustige core.
- **Mix:** minstens 1×, liefst 2× indoor cycling per week, op de lesmomenten: maandag-, woensdag- en
  donderdagavond, en zaterdag en zondag om 10u (🚴 in de Agenda).
  - Tennis telt als conditie. De andere trainingen zijn kracht.
  - Je kan per dag zelf kiezen voor kracht of cycling. Breekt dat een regel, dan zegt de coach het en kan je
    het met één tik terugdraaien.
- **Weer:** op rustdagen bij droog weer wandelen, met het beste uur. Regent het, dan doe je binnen mobiliteit of
  stretching. Het weer komt gratis van Open-Meteo, zonder sleutel. Je plaats kies je met één tik in
  **Meer → Weer**; standaard is dat Brussel.
- **Puur op jouw input:** geen Apple Health nodig. (Een koppeling via de Opdrachten-app ligt klaar voor later,
  zie `docs/opdracht-health.md`, maar staat uit.)
- **Weekrapport** in de app en een wekelijkse **coachsessie met Claude Code** (`/coach`).
- **Meldingen** op iPhone en Watch: 's ochtends je plan, zondag een herinnering om je komende dagen aan te vinken.

## Hoe het werkt

```
publieke repo training-app ──GitHub Pages──▶ app op je iPhone (offline)
   (enkel code, deze repo)                      │  GitHub API + jouw token
                                                ▼
                                     privé-repo training  (al je data)
                                         ├─ GitHub Action: pushmeldingen
                                         └─ Claude Code: /coach elke zondag
```

Geen server, geen database, geen account bij een andere dienst.

| Onderdeel | Kost | Waarom gratis |
|---|---|---|
| App hosten | € 0 | GitHub Pages is gratis voor publieke repo's |
| Data | € 0 | privé-repo op GitHub Free |
| Meldingen | € 0 | Web Push via een GitHub Action (±150 min/maand van de 2000 gratis minuten voor privé-repo's; zonder betaalkaart kan GitHub niets aanrekenen) |
| Coachsessie | € 0 extra | Claude Code met je bestaand abonnement, geen betalende API |
| Weer | € 0 | Open-Meteo: gratis voor niet-commercieel gebruik, geen sleutel, geen account (de app vraagt het hoogstens om de 2 uur op) |

**Privacy:** deze repo bevat enkel code. Je trainingsdata gaan rechtstreeks van je
iPhone naar je **privé**-repo. Je token blijft op je iPhone. Meldingen zijn end-to-end versleuteld.
Naar Open-Meteo gaat enkel een afgeronde locatie (±10 km), nooit trainingsdata. Het weerbericht blijft
op je iPhone.

---

## Installatie (±20 minuten, één keer)

### 1. Twee repo's op GitHub

- **Deze repo (`training-app`), publiek.** Fork ze, of gebruik je eigen kopie.
- **Je data-repo (`training`), privé.** Maak een privé-repo met die naam (met een README) en zet er
  [`meldingen.yml`](#meldingen-workflow) in `.github/workflows/` (zit er al in als je ze met Claude Code opzette).

### 2. GitHub Pages aanzetten

In `training-app`: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Ga naar **Actions** en wacht tot *Test en publiceer* groen is (±2 min). Je app staat dan op:

```
https://<jouw-gebruikersnaam>.github.io/training-app/
```

### 3. Een token maken (de sleutel tot je privé-repo)

Open [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):

| Veld | Waarde |
|---|---|
| Token name | `Coach` |
| Expiration | **No expiration** (kies je toch een datum: kies dezelfde in de app, dan waarschuwt ze op tijd) |
| Repository access | **Only select repositories** → `training` (enkel je privé-repo!) |
| Permissions → Repository → **Contents** | **Read and write** |

**Generate token** → kopieer het (je ziet het maar één keer).

### 4. De app op je iPhone

1. Open de URL uit stap 2 in **Safari**.
2. Tik op **Deel** (vierkant met pijl) → **Zet op beginscherm** → **Voeg toe**.
3. Open **Coach** vanaf je beginscherm → **Start**.
4. Plak je token → **Koppel**. Je gebruikersnaam en `training` staan al ingevuld.
5. Kies de gewichtsstappen in Jims (weet je het niet: laat staan) en je voorkeuren (ervaring,
   maximum trainingen per 7 dagen, lesmomenten van indoor cycling, tennisdag) → **Klaar**.
6. Je komt in de **Agenda**: tik rood wat niet kan (en tennis op donderdag) → **De komende 14 dagen kloppen**.

### 5. Meldingen

In de app: **Meer → Meldingen → Meldingen aanzetten** → **Sta toe** → **Testmelding**.
Binnen ±1 minuut krijg je een melding (ook op je Watch als je iPhone vergrendeld is).
Kies er ook het uur van je ochtendmelding (6–9u).

### 6. Wekelijkse coachsessie

Open Claude Code op je **privé**-repo en typ **`/coach`**. Claude analyseert je week met dezelfde
coachlogica als de app, schrijft `reports/JJJJ-Www.md` (zichtbaar in de app onder **Rapport**),
stuurt volgende week bij en pusht. Dat kan ook automatisch als geplande taak elke zondagavond.

---

## Zo gebruik je het

| Wanneer | Wat |
|---|---|
| **Zondag** (of wanneer je wil) | Melding "Vink je komende dagen aan" → tab **Agenda**: tik rood wat niet kan, tennis aanduiden, *De komende 14 dagen kloppen*. 20 seconden. |
| **'s Ochtends** | Melding met je plan. Open de app → tik hoe je je voelt (en optioneel: spierpijn in benen of bovenlijf) → groen/oranje/rood advies, training past zich aan je herstel aan. |
| **Les gereserveerd** | **Agenda** → tik de les aan in *Reserveer je indoor cycling* (of in **Week** op de dag → *Les gereserveerd*). |
| **Liever cycling dan kracht** (of omgekeerd) | **Week** → tik op de dag → *Liever indoor cycling* / *Liever kracht*. Past het niet binnen de regels, dan zegt de coach waarom. |
| **Haar wassen plannen** | 🚿 in **Week** = conditiedag (nooit 2 dagen na elkaar). Krachtdagen zijn zonder haarwas. |
| **Nieuwe oefening** | Tik op de naam: foto's van de beweging en het toestel, hoe je het instelt, techniektips. |
| **In de gym** | **Start** → per set ✓ → na elke oefening *Gelukt* of *Ik nam meer/minder*. Toestel bezet? Eén tik. |
| **Minder tijd** | Op **Vandaag** tik je *30*: de training past zich aan. |
| **Gewicht** | De app stelt het voor. Na de oefening: *Gelukt*, of *Ik nam meer/minder* + welk gewicht. |
| **Lukt vandaag niet** | **Vandaag lukt niet**: het plan schuift op, zonder sessies op te stapelen. |
| **Pijntje** | **Ik heb last van…** → zone + ernst. Oefeningen worden vervangen of lichter, daarna rustig opbouwen. |
| **Ziek** | **Ik heb last van… → 🤒 Ik ben ziek** (of via dagvorm *Ziek of op*). Ziek is ziek: rust tot je *Genezen* tikt, daarna zijn je eerste 2 trainingen rustiger (zonder extra uitleg). Lang ziek of erger: de coach raadt je huisarts aan. |
| **Groepsles of tennis** | Tik na afloop op *Gedaan* (of *Groepsles of cardio gedaan?* als het niet gepland was). |

## Problemen oplossen

| Probleem | Oplossing |
|---|---|
| "Je token is ongeldig of verlopen" | Maak een nieuw token (stap 3) → **Meer → Privé-repo → Token vervangen**. |
| "Repo niet gevonden" | Klopt de naam van je privé-repo? Heeft het token toegang tot precies die repo? |
| "Deze repo is publiek" | Je data-repo moet privé zijn: Settings → Danger Zone → Change visibility. |
| Geen meldingen | App vanaf het beginscherm geopend? Meldingen toegestaan (Instellingen → Meldingen → Coach)? Staat `meldingen.yml` in je privé-repo en is Pages groen? Kijk in **Actions → Meldingen**. |
| Offline in de gym | Geen probleem: alles staat op je iPhone en gaat later mee. |
| Nieuwe iPhone | App opnieuw op het beginscherm zetten en je token plakken: alles komt terug. |

---

## Ontwikkelen

```bash
npm ci
npm run dev        # lokale server
npm test           # unit tests (coachlogica, sync, Health, meldingen)
npm run e2e        # end-to-end in iPhone-formaat (Playwright)
npm run build      # productie-build + dist/coach-cli.mjs
```

| Map | Inhoud |
|---|---|
| `src/coach/` | pure coachlogica: catalogus, gewichten, progressie, dagvorm, herstel per spiergroep, sterke/werkpunten, weer, blessures, planner + regels, sessies, rapport, Health |
| `src/data/` | opslag (IndexedDB), sync met GitHub, weer ophalen (lokaal), Health-inbox, meldingen |
| `src/ui/` | Preact-schermen en componenten |
| `cli/` | `coach-cli` voor GitHub Actions en `/coach` |
| `docs/` | handleiding voor een latere Apple Health-koppeling (staat uit) |
| `public/ex/` | oefenfoto's |

Alle beslissingen (plannen, progressie, deload, dagvorm) zijn pure functies met tests, zodat de app,
de meldingen en `/coach` altijd hetzelfde beslissen.

**Oefenfoto's:** [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) (publiek domein, Unlicense),
verkleind tot 480 px.

### Meldingen-workflow

De privé-repo bevat `.github/workflows/meldingen.yml`. Die haalt `coach-cli.mjs` van je Pages-site en
stuurt de meldingen met het abonnement dat de app in `data/push/subscription.json` bewaarde.
