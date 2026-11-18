# Coach – je gratis personal trainer op je iPhone

Een app op je beginscherm die je trainingen plant, elke set vooraf invult en zelf bijstuurt.
Werkt offline in de gym, draait puur op jouw tikken en kost **€ 0**.

- **Vandaag:** wat je doet, één knop **Start**. Dagvorm met één tik: top / oké / moe / ziek of op.
- **Trainen:** gewicht en reps staan klaar, per set één tik ✓, rusttimer start vanzelf, draaiwiel met
  enkel geldige gewichten (thuis: enkel wat je met je eigen schijven kan maken), "Toestel bezet",
  **foto's van elke oefening en elk toestel** (start- en eindpositie, ook offline), techniektips en uitlegvideo.
- **Absolute beginner:** lichte start, de eerste 2 keer per oefening max 2 sets om de beweging te leren,
  in Jims eerst de toestellen.
- **Slimme coach:** dubbele progressie, thuisladder als zwaarder niet kan, deloads, blessures
  ("Ik heb last van…"), flexibel herplannen bij een gemiste training, minder tijd of thuis i.p.v. Jims.
- **Rollend plannen:** altijd de komende 7 dagen. Je vinkt aan welke avonden passen (in het weekend
  ook overdag; Jims sluit dan om 17u, dus een weekendavond is thuis), en of je tennist.
- **Harde regels:** max 4 zweetsessies per 7 dagen (groepslessen en tennis inbegrepen), nooit twee dagen
  na elkaar. Bij 4: 2× kracht + 2× conditie, met indoor cycling op de lesmomenten. Zweetvrije suggesties
  op de tussendagen.
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

**Privacy:** deze repo bevat enkel code. Je trainingsdata gaan rechtstreeks van je
iPhone naar je **privé**-repo. Je token blijft op je iPhone. Meldingen zijn end-to-end versleuteld.

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
5. Tik je thuismateriaal aan: gewicht van een lege dumbbell, je schijven (per paar), het
   verbindingsstuk van de stang en je kettlebell. Je ziet meteen wat je ermee kan maken.
6. Kies de gewichtsstappen in Jims (weet je het niet: laat staan) en je voorkeuren (ervaring,
   trainingen per 7 dagen, lesmomenten van indoor cycling, tennisdag) → **Klaar**.
7. Vink aan welke momenten de komende 7 dagen passen → **Bewaar en plan**.

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
| **Zondag** (of wanneer je wil) | Melding "Vink je komende dagen aan" → avonden (en weekend overdag) aanvinken, tennis aanduiden. 20 seconden. |
| **'s Ochtends** | Melding met je plan. Open de app → tik hoe je je voelt → groen/oranje/rood advies. |
| **Nieuwe oefening** | Tik op de naam: foto's van de beweging en het toestel, hoe je het instelt, techniektips. |
| **In de gym** | **Start** → per set ✓ → na elke oefening *te licht / goed / zwaar*. Toestel bezet? Eén tik. |
| **Thuis i.p.v. Jims, of minder tijd** | Op **Vandaag** tik je *Thuis* of *30*: de training past zich aan. |
| **Lukt vandaag niet** | **Vandaag lukt niet**: het plan schuift op, zonder sessies op te stapelen. |
| **Pijntje** | **Ik heb last van…** → zone + ernst. Oefeningen worden vervangen of lichter, daarna rustig opbouwen. |
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
| `src/coach/` | pure coachlogica: catalogus, gewichten, progressie, dagvorm, blessures, planner + regels, sessies, rapport, Health |
| `src/data/` | opslag (IndexedDB), sync met GitHub, Health-inbox, meldingen |
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
