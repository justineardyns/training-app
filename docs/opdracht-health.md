# Opdracht "Training Sync": Apple Health → je coach

Met deze opdracht stuurt je iPhone elke dag je slaap, HRV, rusthartslag, stappen, hartslag en
Watch-workouts naar je **privé-repo**. De app gebruikt dat voor je dagvorm, en je groepslessen en
cardio tellen automatisch mee. Alles gratis, met de ingebouwde **Opdrachten**-app.

⏱️ Reken op ±10 minuten. Je bouwt het één keer.

> **Waarom niet gewoon om 7u 's ochtends?** iOS geeft Health-gegevens niet vrij zolang je iPhone
> vergrendeld is. Daarom laat je de opdracht lopen als je een app opent die je elke ochtend gebruikt
> (je toestel is dan ontgrendeld). In de Coach-app kan je ze ook altijd zelf starten met
> **Haal Watch-data op**.

---

## Wat je nodig hebt

- Je GitHub-token (hetzelfde als in de app; maak eventueel een nieuw met dezelfde instellingen)
- Je GitHub-gebruikersnaam en de naam van je privé-repo (standaard `training`)

**Tip bij het zoeken naar acties:** tik onderaan op het zoekveld en typ het zoekwoord uit de tabel.
De Nederlandse namen kunnen per iOS-versie licht verschillen; het zoekwoord vindt ze altijd.

---

## Deel 1: de opdracht bouwen

Open **Opdrachten** → tab **Opdrachten** → **+** (rechtsboven). Tik bovenaan op de naam en noem
ze exact **`Training Sync`**. De app start de opdracht met die naam.

### Stap 1 – Zes keer gezondheidsgegevens zoeken

Voeg zes keer de actie **Zoek gezondheidsstalen** toe (*Find Health Samples*, zoekwoord: `gezondheid`).
Stel elke actie zo in:

| # | Type (tik op "Type") | Filter: Startdatum | Sorteer | Limiet |
|---|---|---|---|---|
| 1 | **Slaap** (*Sleep Analysis*) | is in de laatste **2 dagen** | Startdatum, oudste eerst | uit |
| 2 | **Hartslagvariabiliteit** (*Heart Rate Variability*) | is in de laatste **2 dagen** | Startdatum | uit |
| 3 | **Rusthartslag** (*Resting Heart Rate*) | is in de laatste **2 dagen** | Startdatum | uit |
| 4 | **Stappen** (*Steps*) | is in de laatste **1 dag** | Startdatum | uit |
| 5 | **Hartslag** (*Heart Rate*) | is in de laatste **1 dag** | Startdatum | uit |
| 6 | **Workouts** | is in de laatste **2 dagen** | Startdatum | uit |

> Staat **Workouts** niet in de lijst op jouw iOS-versie? Sla actie 6 over en laat in stap 2 de
> drie WORKOUT-regels weg. Groepslessen tel je dan met één tik in de app ("Groepsles of cardio gedaan?").

**Tip:** tik lang op elke actie → **Hernoem** en noem ze *Slaap*, *HRV*, *Rust*, *Stappen*,
*Hartslag*, *Workouts*. Dat maakt stap 2 veel makkelijker.

### Stap 2 – Alles in één tekst zetten

Voeg de actie **Tekst** toe (*Text*, zoekwoord: `tekst`). Typ de regels die met `#` beginnen zelf,
en zet op elke lege regel eronder een **variabele**:

1. Tik op de lege regel → boven het toetsenbord verschijnen de variabelen → kies de juiste actie
   (bv. *Slaap*).
2. Tik op de blauwe variabele die verschijnt → kies de **eigenschap** uit de tabel (bv. *Waarde*).
3. Bij datums: kies in hetzelfde menu **Datumnotatie: ISO 8601** en zet **Neem ISO 8601-tijd op** aan.
   (Vergeet je dat, dan werkt het meestal ook; ISO is wel het veiligst.)

```
#SLAAP_WAARDE
[Slaap → Waarde]
#SLAAP_START
[Slaap → Startdatum]
#SLAAP_EINDE
[Slaap → Einddatum]
#HRV_WAARDE
[HRV → Waarde]
#HRV_START
[HRV → Startdatum]
#RUST_WAARDE
[Rust → Waarde]
#RUST_START
[Rust → Startdatum]
#STAPPEN_WAARDE
[Stappen → Waarde]
#STAPPEN_START
[Stappen → Startdatum]
#STAPPEN_BRON
[Stappen → Bron]
#HARTSLAG_WAARDE
[Hartslag → Waarde]
#HARTSLAG_START
[Hartslag → Startdatum]
#WORKOUT_TYPE
[Workouts → Naam]
#WORKOUT_START
[Workouts → Startdatum]
#WORKOUT_EINDE
[Workouts → Einddatum]
```

> Bij **WORKOUT_TYPE** kies je de eigenschap die het soort workout toont (meestal *Naam*,
> soms *Type workout*). Zie je na de eerste test "Workouts" in plaats van "Indoor fietsen" in de app,
> kies dan een andere eigenschap.

### Stap 3 – Coderen

Voeg **Codeer met Base64** toe (*Base64 Encode*, zoekwoord: `base64`).
- Invoer: de **Tekst** van stap 2
- Tik op de pijl → **Regeleinden: Geen** (*Line Breaks: None*)

### Stap 4 – Bestandsnaam met datum

Voeg **Huidige datum** toe (*Current Date*, zoekwoord: `huidige datum`), en daarna
**Wijzig datumnotatie** (*Format Date*, zoekwoord: `datum`):
- Datumnotatie: **Aangepast**
- Notatie: `yyyy-MM-dd'T'HH-mm-ss`

### Stap 5 – Naar je privé-repo sturen

Voeg **Haal inhoud van URL op** toe (*Get Contents of URL*, zoekwoord: `url`).

**URL** (vervang `GEBRUIKER` en eventueel `training`, en zet op het einde de variabele *Opgemaakte datum*
van stap 4 vóór `.txt`):
```
https://api.github.com/repos/GEBRUIKER/training/contents/data/health/inbox/[Opgemaakte datum].txt
```

Tik op de pijl om alles te tonen:
- **Methode:** `PUT`
- **Headers** (tik twee keer op *Voeg nieuwe header toe*):
  | Sleutel | Waarde |
  |---|---|
  | `Authorization` | `Bearer ` gevolgd door je token (één spatie na Bearer) |
  | `Accept` | `application/vnd.github+json` |
- **Hoofdtekst verzoek:** `JSON`, met twee velden (beide type *Tekst*):
  | Sleutel | Waarde |
  |---|---|
  | `message` | `Health-sync` |
  | `content` | variabele **Base64-gecodeerd** van stap 3 |

### Stap 6 – Testen

Tik op ▶︎ (onderaan). De eerste keer vraagt iOS:
- **Toegang tot Gezondheid** → zet alles aan → *Sta toe*
- **"Training Sync" wil gegevens naar api.github.com sturen** → **Sta altijd toe**

Open daarna de Coach-app → **Meer → Apple Health**. Na een paar seconden zie je bij
*Laatste import* je slaap, HRV en workouts. 🎉

> **Foutmelding van GitHub?** `401` = token fout of verlopen · `404` = gebruikersnaam/repo fout of
> het token heeft geen toegang tot die repo · `422` = de opdracht liep twee keer in dezelfde seconde
> (gewoon nog eens proberen).

---

## Deel 2: automatisch elke dag (aanrader)

### 2a – Niet te vaak (rem van 3 uur)

Zet deze acties **helemaal bovenaan** de opdracht, vóór stap 1. Zo loopt ze maximaal één keer per
3 uur, ook als je die app 20 keer opent. Start je ze zelf vanuit de Coach-app, dan negeert ze de rem.

1. **Als** (*If*, zoekwoord: `als`): *Invoer opdracht* (*Shortcut Input*) **is** `nu`
2. Laat het deel tussen **Als** en **Anders** leeg.
3. Onder **Anders** (*Otherwise*):
   1. **Haal bestand op** (*Get File*, zoekwoord: `bestand`): map *Opdrachten*, pad `coach-laatste.txt`,
      **Fout indien niet gevonden: uit**
   2. **Haal datums uit invoer** (*Get Dates from Input*, zoekwoord: `datums`): invoer = *Bestand*
   3. **Haal tijd tussen datums op** (*Get Time Between Dates*, zoekwoord: `tijd tussen`):
      van *Datums* tot *Huidige datum*, in **Uren**
   4. **Als** *Tijd tussen datums* **is kleiner dan** `3` → **Stop deze opdracht** (*Stop This Shortcut*)
   5. (Laat de **Anders** van deze binnenste Als leeg.)
4. Helemaal **onderaan** de opdracht (na stap 5):
   1. **Tekst** met de variabele *Huidige datum*
   2. **Bewaar bestand** (*Save File*): map *Opdrachten*, naam `coach-laatste.txt`,
      **Vraag waar te bewaren: uit**, **Overschrijf indien bestand bestaat: aan**

> Geen zin in deel 2a? Dan kan je het overslaan: kies in 2b dan een app die je maar één keer per
> dag opent, of start de opdracht gewoon vanuit de Coach-app.

### 2b – De automatisering

Opdrachten → tab **Automatisering** → **+** → **App**:
1. **App:** kies 1 of 2 apps die je elke ochtend opent (bv. WhatsApp, Weer of Mail)
2. Vink **Is geopend** aan
3. Kies **Voer direct uit** (niet "Vraag voor uitvoering") en zet **Melding bij uitvoering** uit
4. **Volgende** → kies **Training Sync** → **Gereed**

Klaar. Vanaf nu loopt de sync elke ochtend vanzelf, op een moment dat je iPhone ontgrendeld is.

---

## Hoe de app het gebruikt

| Gegeven | Gebruikt voor |
|---|---|
| Slaap (enkel echt slapen, dubbele metingen weggefilterd) | dagvorm |
| HRV (gemiddelde van de nacht) | dagvorm, hersteltrend |
| Rusthartslag | dagvorm, hersteltrend |
| Stappen (hoogste bron, niet iPhone + Watch dubbel) | weekrapport |
| Workouts ≥ 15 min (groepsles, cardio) | tellen automatisch als sessie (max 4/week, rustdagen) |
| Krachttraining op je Watch | duur + gemiddelde/max hartslag gekoppeld aan je app-sessie |
| Wandelen, yoga, stretching | tellen **niet** als zweettraining |

Je ruwe export komt eerst in `data/health/inbox/`. De app vat ze samen in `data/health/JJJJ-MM.json`
en ruimt de inbox daarna op. Alles blijft in je **privé**-repo.
