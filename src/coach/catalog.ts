import type { Exercise, Location, Pattern, Zone } from './types.ts';

// Oefeningencatalogus. Elke oefening: Nederlandse naam, patroon, spieren, waar het kan,
// hoe het geladen wordt, belasting per zone (voor blessures), korte tips en een videozoekterm.

const E: Exercise[] = [
  // ── Squat ────────────────────────────────────────────────────────────
  {
    id: 'leg-press', name: 'Leg press', pattern: 'squat', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym'], load: 'machine', repRange: [10, 15], start: 60, maxLoad: 300,
    stress: { knie: 2, onderrug: 1, heup: 1 },
    tips: ['Voeten heupbreed midden op het platform.', 'Zak tot je knieën ±90° zijn; je onderrug blijft tegen de rugleuning.', 'Knieën niet op slot duwen bovenaan.'],
    video: 'leg press proper form',
  },
  {
    id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', muscles: ['quadriceps', 'bilspieren', 'core'],
    locations: ['gym', 'home'], load: 'db_single', repRange: [8, 12], start: 12, harder: 'bulgarian-split-squat',
    stress: { knie: 2, onderrug: 1, heup: 1 },
    tips: ['Dumbbell rechtop tegen je borst, ellebogen naar beneden.', 'Zak tussen je hielen, borst blijft omhoog.', 'Knieën volgen je tenen.'],
    video: 'goblet squat form',
  },
  {
    id: 'kb-goblet-squat', name: 'Goblet squat (kettlebell)', pattern: 'squat', muscles: ['quadriceps', 'bilspieren', 'core'],
    locations: ['gym', 'home'], load: 'kb', repRange: [8, 15], start: 12, harder: 'bulgarian-split-squat',
    stress: { knie: 2, onderrug: 1, heup: 1 },
    tips: ['Kettlebell aan de hoorns tegen je borst.', 'Zak diep tussen je hielen, borst omhoog.', 'Duw de grond weg om recht te komen.'],
    video: 'kettlebell goblet squat form',
  },
  {
    id: 'hack-squat', name: 'Hack squat (toestel)', pattern: 'squat', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym'], load: 'machine', repRange: [8, 12], start: 30, maxLoad: 200,
    stress: { knie: 3, onderrug: 1, heup: 1 },
    tips: ['Rug volledig tegen het kussen.', 'Gecontroleerd zakken, krachtig omhoog.', 'Hielen blijven op het platform.'],
    video: 'hack squat machine form',
  },
  {
    id: 'smith-squat', name: 'Squat in smith-machine', pattern: 'squat', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym'], load: 'barbell', repRange: [8, 12], start: 30,
    stress: { knie: 2, onderrug: 2, heup: 1 },
    tips: ['Voeten iets voor de stang.', 'Zak tot je dijen horizontaal zijn.', 'Span je buik aan voor elke rep.'],
    video: 'smith machine squat form',
  },
  // ── Lunge / eenzijdig been ───────────────────────────────────────────
  {
    id: 'reverse-lunge', name: 'Reverse lunge met dumbbells', pattern: 'lunge', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym', 'home'], load: 'db_pair', unilateral: true, repRange: [8, 12], start: 6, harder: 'bulgarian-split-squat',
    stress: { knie: 2, heup: 1, enkel: 1 },
    tips: ['Stap ruim achteruit en zak recht naar beneden.', 'Voorste knie blijft boven je voet.', 'Duw je terug via de hiel van je voorste voet.'],
    video: 'dumbbell reverse lunge form',
  },
  {
    id: 'bulgarian-split-squat', name: 'Bulgarian split squat', pattern: 'lunge', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym', 'home'], load: 'db_pair', unilateral: true, repRange: [8, 12], start: 6,
    stress: { knie: 3, heup: 1, enkel: 1 },
    tips: ['Achterste voet op een bank of stoel, wreef plat.', 'Zak verticaal; voorste hiel blijft aan de grond.', 'Begin met je zwakste been.'],
    video: 'bulgarian split squat form',
  },
  {
    id: 'step-up', name: 'Step-up met dumbbells', pattern: 'lunge', muscles: ['quadriceps', 'bilspieren'],
    locations: ['gym', 'home'], load: 'db_pair', unilateral: true, repRange: [8, 12], start: 6,
    stress: { knie: 2, heup: 1, enkel: 1 },
    tips: ['Thuis: gebruik een stevige traptrede of bank.', 'Duw je op via je volledige voet, niet afzetten met het onderste been.', 'Rustig terug naar beneden.'],
    video: 'dumbbell step up form',
  },
  // ── Hinge ────────────────────────────────────────────────────────────
  {
    id: 'rdl-db', name: 'Roemeense deadlift (dumbbells)', pattern: 'hinge', muscles: ['hamstrings', 'bilspieren', 'rug'],
    locations: ['gym', 'home'], load: 'db_pair', repRange: [8, 12], start: 10, harder: 'single-leg-rdl',
    stress: { onderrug: 2, heup: 1 },
    tips: ['Heupen naar achter, knieën licht gebogen.', 'Dumbbells dicht langs je benen; rug blijft recht.', 'Stop als je hamstrings goed rekken (meestal net onder de knie).'],
    video: 'dumbbell romanian deadlift form',
  },
  {
    id: 'rdl-homebar', name: 'Roemeense deadlift (thuisstang)', pattern: 'hinge', muscles: ['hamstrings', 'bilspieren', 'rug'],
    locations: ['home'], load: 'home_bar', repRange: [8, 12], start: 20, harder: 'single-leg-rdl',
    stress: { onderrug: 2, heup: 1 },
    tips: ['Stang dicht tegen je dijen houden.', 'Heupen naar achter, rug recht.', 'Krachtig omhoog door je heupen naar voren te duwen.'],
    video: 'barbell romanian deadlift form',
  },
  {
    id: 'rdl-barbell', name: 'Roemeense deadlift (stang)', pattern: 'hinge', muscles: ['hamstrings', 'bilspieren', 'rug'],
    locations: ['gym'], load: 'barbell', repRange: [8, 12], start: 30,
    stress: { onderrug: 3, heup: 1 },
    tips: ['Stang dicht tegen je benen.', 'Schouderbladen licht samen, rug recht.', 'Niet verder zakken dan je met een rechte rug kunt.'],
    video: 'barbell romanian deadlift form',
  },
  {
    id: 'single-leg-rdl', name: 'Eenbenige Roemeense deadlift', pattern: 'hinge', muscles: ['hamstrings', 'bilspieren', 'core'],
    locations: ['gym', 'home'], load: 'db_single', unilateral: true, repRange: [8, 12], start: 8,
    stress: { onderrug: 1, heup: 1, enkel: 1 },
    tips: ['Dumbbell in de hand tegenover je standbeen.', 'Heup en schouders blijven vierkant naar de grond.', 'Houd je vast aan een muur als balans het zwakke punt is.'],
    video: 'single leg romanian deadlift form',
  },
  {
    id: 'hip-thrust', name: 'Hip thrust (stang)', pattern: 'hinge', muscles: ['bilspieren', 'hamstrings'],
    locations: ['gym'], load: 'barbell', repRange: [8, 12], start: 40,
    stress: { heup: 1, onderrug: 1 },
    tips: ['Schouderbladen op de rand van een bank, kussen op je heupen.', 'Kin naar je borst, ribben laag.', 'Bovenaan 1 tel je bilspieren aanspannen.'],
    video: 'barbell hip thrust form',
  },
  {
    id: 'glute-bridge', name: 'Glute bridge met dumbbell', pattern: 'hinge', muscles: ['bilspieren', 'hamstrings'],
    locations: ['home', 'gym'], load: 'db_single', repRange: [10, 15], start: 10, harder: 'single-leg-hip-thrust',
    stress: { heup: 1 },
    tips: ['Liggend op je rug, dumbbell op je heupen.', 'Duw door je hielen omhoog tot een rechte lijn.', 'Bovenaan 1 tel vasthouden.'],
    video: 'dumbbell glute bridge form',
  },
  {
    id: 'single-leg-hip-thrust', name: 'Eenbenige hip thrust', pattern: 'hinge', muscles: ['bilspieren', 'hamstrings'],
    locations: ['home', 'gym'], load: 'db_single', unilateral: true, repRange: [8, 12], start: 0,
    stress: { heup: 1, onderrug: 1 },
    tips: ['Schouders op de zetel of bank.', 'Een been in de lucht, duw via de hiel van je standbeen.', 'Bekken blijft horizontaal.'],
    video: 'single leg hip thrust form',
  },
  {
    id: 'back-extension', name: 'Back extension', pattern: 'hinge', muscles: ['bilspieren', 'hamstrings', 'rug'],
    locations: ['gym'], load: 'bodyweight', repRange: [10, 15], start: 0,
    stress: { onderrug: 2, heup: 1 },
    tips: ['Kussen net onder je heupbeenderen.', 'Buig vanuit de heupen, niet vanuit je rug.', 'Stop bovenaan in een rechte lijn, niet overstrekken.'],
    video: '45 degree back extension glute focus',
  },
  {
    id: 'kb-deadlift', name: 'Kettlebell deadlift', pattern: 'hinge', muscles: ['bilspieren', 'hamstrings'],
    locations: ['home', 'gym'], load: 'kb', repRange: [10, 15], start: 12, harder: 'single-leg-rdl',
    stress: { onderrug: 2, heup: 1 },
    tips: ['Kettlebell tussen je voeten.', 'Heupen naar achter, rug recht, armen gestrekt.', 'Sta recht door je heupen naar voren te duwen.'],
    video: 'kettlebell deadlift form',
  },
  {
    id: 'leg-curl', name: 'Leg curl (toestel)', pattern: 'legs_iso', muscles: ['hamstrings'],
    locations: ['gym'], load: 'machine', repRange: [10, 15], start: 20,
    stress: { knie: 1 },
    tips: ['Knie in lijn met het draaipunt van het toestel.', 'Rustig terug, 2 tellen.', 'Heupen blijven op het kussen.'],
    video: 'seated leg curl form',
  },
  {
    id: 'leg-extension', name: 'Leg extension (toestel)', pattern: 'legs_iso', muscles: ['quadriceps'],
    locations: ['gym'], load: 'machine', repRange: [10, 15], start: 20,
    stress: { knie: 2 },
    tips: ['Knie in lijn met het draaipunt.', 'Bovenaan 1 tel vasthouden.', 'Gecontroleerd zakken.'],
    video: 'leg extension machine form',
  },
  // ── Duwen horizontaal ───────────────────────────────────────────────
  {
    id: 'db-bench', name: 'Dumbbell bench press', pattern: 'push_h', muscles: ['borst', 'triceps', 'schouders'],
    locations: ['gym'], load: 'db_pair', repRange: [8, 12], start: 10,
    stress: { schouder: 2, elleboog: 1, pols: 1 },
    tips: ['Schouderbladen samen en laag op de bank.', 'Ellebogen ±45° van je lichaam.', 'Zak tot de dumbbells op borsthoogte.'],
    video: 'dumbbell bench press form',
  },
  {
    id: 'incline-db-press', name: 'Schuine dumbbell press', pattern: 'push_h', muscles: ['borst', 'schouders', 'triceps'],
    locations: ['gym'], load: 'db_pair', repRange: [8, 12], start: 8,
    stress: { schouder: 2, elleboog: 1, pols: 1 },
    tips: ['Bank op 30°.', 'Dumbbells boven je bovenborst.', 'Gecontroleerd zakken, 2 tellen.'],
    video: 'incline dumbbell press form',
  },
  {
    id: 'chest-press', name: 'Chest press (toestel)', pattern: 'push_h', muscles: ['borst', 'triceps', 'schouders'],
    locations: ['gym'], load: 'machine', repRange: [8, 12], start: 25,
    stress: { schouder: 1, elleboog: 1 },
    tips: ['Handgrepen op borsthoogte.', 'Schouderbladen tegen de leuning.', 'Niet volledig op slot duwen.'],
    video: 'chest press machine form',
  },
  {
    id: 'barbell-bench', name: 'Bankdrukken (stang)', pattern: 'push_h', muscles: ['borst', 'triceps', 'schouders'],
    locations: ['gym'], load: 'barbell', repRange: [6, 10], start: 30,
    stress: { schouder: 3, elleboog: 1, pols: 1 },
    tips: ['Ogen onder de stang, schouderbladen samen.', 'Stang raakt je onderborst.', 'Train zwaar enkel met een spotter of veiligheidsarmen.'],
    video: 'bench press form beginner',
  },
  {
    id: 'incline-push-up', name: 'Push-up met handen verhoogd', pattern: 'push_h', muscles: ['borst', 'triceps', 'schouders'],
    locations: ['home', 'gym'], load: 'bodyweight', repRange: [8, 15], start: 0, harder: 'push-up',
    stress: { schouder: 1, pols: 1, elleboog: 1 },
    tips: ['Handen op een bank, tafel of trede.', 'Lichaam in één rechte plank.', 'Borst tot aan de rand.'],
    video: 'incline push up form',
  },
  {
    id: 'push-up', name: 'Push-up', pattern: 'push_h', muscles: ['borst', 'triceps', 'schouders', 'core'],
    locations: ['home', 'gym'], load: 'bodyweight', repRange: [8, 15], start: 0, harder: 'feet-elevated-push-up',
    stress: { schouder: 2, pols: 2, elleboog: 1 },
    tips: ['Handen iets breder dan je schouders.', 'Buik en bilspieren aangespannen, heupen zakken niet.', 'Borst bijna tot aan de grond.'],
    video: 'push up perfect form',
  },
  {
    id: 'feet-elevated-push-up', name: 'Push-up met voeten verhoogd', pattern: 'push_h', muscles: ['borst', 'schouders', 'triceps'],
    locations: ['home', 'gym'], load: 'bodyweight', repRange: [8, 15], start: 0,
    stress: { schouder: 2, pols: 2, elleboog: 1 },
    tips: ['Voeten op een stoel of bank.', 'Romp blijft één lijn.', 'Gecontroleerd zakken.'],
    video: 'feet elevated push up form',
  },
  {
    id: 'db-floor-press', name: 'Floor press met dumbbells', pattern: 'push_h', muscles: ['borst', 'triceps'],
    locations: ['home'], load: 'db_pair', repRange: [8, 12], start: 8,
    stress: { schouder: 1, elleboog: 1, pols: 1 },
    tips: ['Liggend op de grond, knieën gebogen.', 'Laat je bovenarmen zacht de grond raken.', 'Duw krachtig omhoog, ellebogen ±45°.'],
    video: 'dumbbell floor press form',
  },
  // ── Duwen verticaal ─────────────────────────────────────────────────
  {
    id: 'db-shoulder-press', name: 'Schouderpress zittend (dumbbells)', pattern: 'push_v', muscles: ['schouders', 'triceps'],
    locations: ['gym'], load: 'db_pair', repRange: [8, 12], start: 8,
    stress: { schouder: 3, elleboog: 1, nek: 1 },
    tips: ['Rugleuning bijna rechtop.', 'Dumbbells starten op oorhoogte.', 'Duw omhoog zonder je rug hol te trekken.'],
    video: 'seated dumbbell shoulder press form',
  },
  {
    id: 'machine-shoulder-press', name: 'Schouderpress (toestel)', pattern: 'push_v', muscles: ['schouders', 'triceps'],
    locations: ['gym'], load: 'machine', repRange: [8, 12], start: 15,
    stress: { schouder: 2, elleboog: 1 },
    tips: ['Handgrepen op schouderhoogte.', 'Rug tegen de leuning.', 'Niet op slot duwen bovenaan.'],
    video: 'machine shoulder press form',
  },
  {
    id: 'standing-db-press', name: 'Staande schouderpress (dumbbells)', pattern: 'push_v', muscles: ['schouders', 'triceps', 'core'],
    locations: ['home', 'gym'], load: 'db_pair', repRange: [8, 12], start: 6, harder: 'half-kneeling-kb-press',
    stress: { schouder: 3, elleboog: 1, onderrug: 1, nek: 1 },
    tips: ['Buik en bilspieren aan, geen holle rug.', 'Duw de dumbbells recht omhoog, hoofd door je armen.', 'Rustig terug naar oorhoogte.'],
    video: 'standing dumbbell shoulder press form',
  },
  {
    id: 'half-kneeling-kb-press', name: 'Eenarmige press op één knie (kettlebell)', pattern: 'push_v', muscles: ['schouders', 'triceps', 'core'],
    locations: ['home', 'gym'], load: 'kb', unilateral: true, repRange: [6, 12], start: 8,
    stress: { schouder: 2, elleboog: 1 },
    tips: ['Knie onder je heup, andere voet voor je.', 'Kettlebell rust op je onderarm.', 'Duw omhoog zonder opzij te leunen.'],
    video: 'half kneeling kettlebell press form',
  },
  {
    id: 'pike-push-up', name: 'Pike push-up', pattern: 'push_v', muscles: ['schouders', 'triceps'],
    locations: ['home', 'gym'], load: 'bodyweight', repRange: [6, 12], start: 0,
    stress: { schouder: 2, pols: 2, nek: 1 },
    tips: ['Heupen hoog, lichaam een omgekeerde V.', 'Zak met je hoofd vóór je handen.', 'Ellebogen naar achter, niet opzij.'],
    video: 'pike push up form',
  },
  // ── Trekken verticaal ───────────────────────────────────────────────
  {
    id: 'lat-pulldown', name: 'Lat pulldown', pattern: 'pull_v', muscles: ['rug', 'biceps'],
    locations: ['gym'], load: 'cable', repRange: [8, 12], start: 30,
    stress: { schouder: 2, elleboog: 1 },
    tips: ['Grip iets breder dan schouders.', 'Trek de stang naar je bovenborst, ellebogen naar je zij.', 'Niet achteroverhangen.'],
    video: 'lat pulldown proper form',
  },
  {
    id: 'close-grip-pulldown', name: 'Pulldown met smalle greep', pattern: 'pull_v', muscles: ['rug', 'biceps'],
    locations: ['gym'], load: 'cable', repRange: [8, 12], start: 30,
    stress: { schouder: 1, elleboog: 1 },
    tips: ['V-greep of smalle handgreep.', 'Trek naar je borstbeen.', 'Schouders laag houden.'],
    video: 'close grip lat pulldown form',
  },
  {
    id: 'db-pullover', name: 'Dumbbell pullover', pattern: 'pull_v', muscles: ['rug', 'borst'],
    locations: ['home', 'gym'], load: 'db_single', repRange: [10, 15], start: 8,
    stress: { schouder: 2, elleboog: 1 },
    tips: ['Thuis: liggend op de grond of over een stevige bank.', 'Armen licht gebogen, dumbbell achter je hoofd laten zakken.', 'Ribben laag, trek terug tot boven je borst.'],
    video: 'dumbbell pullover form',
  },
  // ── Trekken horizontaal ─────────────────────────────────────────────
  {
    id: 'seated-cable-row', name: 'Roeien aan de kabel (zittend)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['gym'], load: 'cable', repRange: [8, 12], start: 30,
    stress: { onderrug: 1, elleboog: 1 },
    tips: ['Rechte rug, borst omhoog.', 'Trek je ellebogen naar achter, schouderbladen samen.', 'Niet met je romp mee zwaaien.'],
    video: 'seated cable row form',
  },
  {
    id: 'machine-row', name: 'Roeien (toestel)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['gym'], load: 'machine', repRange: [8, 12], start: 25,
    stress: { elleboog: 1 },
    tips: ['Borst tegen het kussen.', 'Trek de ellebogen voorbij je romp.', 'Rustig terug, schouders naar voren laten komen.'],
    video: 'machine row form',
  },
  {
    id: 'chest-supported-row', name: 'Roeien op schuine bank (dumbbells)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['gym'], load: 'db_pair', repRange: [8, 12], start: 10,
    stress: { elleboog: 1, schouder: 1 },
    tips: ['Borst op de schuine bank (30–45°).', 'Ellebogen naar je heupen trekken.', 'Even vasthouden bovenaan.'],
    video: 'chest supported dumbbell row form',
  },
  {
    id: 'one-arm-db-row', name: 'Eenarmig roeien (dumbbell)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['home', 'gym'], load: 'db_single', unilateral: true, repRange: [8, 12], start: 12,
    stress: { onderrug: 1, elleboog: 1 },
    tips: ['Steun met hand en knie op een bank of stoel.', 'Trek de dumbbell naar je heup.', 'Romp blijft stil en recht.'],
    video: 'one arm dumbbell row form',
  },
  {
    id: 'bent-over-row-homebar', name: 'Voorovergebogen roeien (thuisstang)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['home'], load: 'home_bar', repRange: [8, 12], start: 20, harder: 'one-arm-db-row',
    stress: { onderrug: 2, elleboog: 1 },
    tips: ['Heupen naar achter, romp ±45° voorover.', 'Trek de stang naar je navel.', 'Rug blijft recht, nek in lijn.'],
    video: 'barbell bent over row form',
  },
  {
    id: 'bent-over-row-db', name: 'Voorovergebogen roeien (dumbbells)', pattern: 'pull_h', muscles: ['rug', 'biceps'],
    locations: ['home', 'gym'], load: 'db_pair', repRange: [8, 12], start: 8, harder: 'one-arm-db-row',
    stress: { onderrug: 2, elleboog: 1 },
    tips: ['Heupen naar achter, rug recht.', 'Ellebogen langs je lichaam naar achter.', 'Gecontroleerd laten zakken.'],
    video: 'dumbbell bent over row form',
  },
  // ── Core ────────────────────────────────────────────────────────────
  {
    id: 'dead-bug', name: 'Dead bug', pattern: 'core', muscles: ['core'],
    locations: ['home', 'gym'], load: 'bodyweight', repRange: [6, 12], start: 0,
    stress: {},
    tips: ['Onderrug blijft tegen de grond.', 'Strek tegenovergestelde arm en been traag uit.', 'Uitademen terwijl je strekt. Reps per kant.'],
    video: 'dead bug exercise form',
  },
  {
    id: 'plank', name: 'Plank', pattern: 'core', muscles: ['core'],
    locations: ['home', 'gym'], load: 'bodyweight', timed: true, repRange: [20, 45], start: 0, harder: 'side-plank',
    stress: { schouder: 1, onderrug: 1 },
    tips: ['Ellebogen onder je schouders.', 'Bilspieren en buik aan, heupen in lijn.', 'Rustig blijven ademen.'],
    video: 'plank proper form',
  },
  {
    id: 'side-plank', name: 'Zijplank', pattern: 'core', muscles: ['core'],
    locations: ['home', 'gym'], load: 'bodyweight', timed: true, unilateral: true, repRange: [15, 40], start: 0,
    stress: { schouder: 1 },
    tips: ['Elleboog onder je schouder.', 'Heupen hoog, lichaam één lijn.', 'Begin op je knieën als het te zwaar is.'],
    video: 'side plank form',
  },
  {
    id: 'pallof-press', name: 'Pallof press', pattern: 'core', muscles: ['core'],
    locations: ['gym'], load: 'cable', unilateral: true, repRange: [8, 12], start: 5,
    stress: {},
    tips: ['Zijwaarts naast de kabel, handgreep tegen je borst.', 'Duw recht vooruit en weersta het draaien.', '2 tellen vasthouden met gestrekte armen.'],
    video: 'pallof press form',
  },
  {
    id: 'bird-dog', name: 'Bird dog', pattern: 'core', muscles: ['core', 'bilspieren'],
    locations: ['home', 'gym'], load: 'bodyweight', unilateral: true, repRange: [6, 12], start: 0,
    stress: {},
    tips: ['Op handen en knieën, rug vlak.', 'Strek tegenovergestelde arm en been.', '2 tellen vasthouden, niet draaien met je bekken.'],
    video: 'bird dog exercise form',
  },
  {
    id: 'suitcase-carry', name: 'Suitcase carry (kettlebell)', pattern: 'core', muscles: ['core', 'rug'],
    locations: ['home', 'gym'], load: 'kb', timed: true, unilateral: true, repRange: [30, 45], start: 12,
    stress: { pols: 1 },
    tips: ['Kettlebell in één hand, wandel rechtop.', 'Niet opzij leunen.', 'Seconden per kant.'],
    video: 'suitcase carry kettlebell form',
  },
  // ── Armen ───────────────────────────────────────────────────────────
  {
    id: 'db-curl', name: 'Biceps curl (dumbbells)', pattern: 'arms', muscles: ['biceps'],
    locations: ['home', 'gym'], load: 'db_pair', repRange: [10, 15], start: 6,
    stress: { elleboog: 2, pols: 1 },
    tips: ['Ellebogen blijven naast je lichaam.', 'Niet zwaaien met je rug.', 'Rustig zakken, 2 tellen.'],
    video: 'dumbbell bicep curl form',
  },
  {
    id: 'hammer-curl', name: 'Hamer curl', pattern: 'arms', muscles: ['biceps'],
    locations: ['home', 'gym'], load: 'db_pair', repRange: [10, 15], start: 6,
    stress: { elleboog: 1, pols: 1 },
    tips: ['Duimen omhoog.', 'Ellebogen stil.', 'Gecontroleerd zakken.'],
    video: 'hammer curl form',
  },
  {
    id: 'triceps-pushdown', name: 'Triceps pushdown (kabel)', pattern: 'arms', muscles: ['triceps'],
    locations: ['gym'], load: 'cable', repRange: [10, 15], start: 15,
    stress: { elleboog: 2 },
    tips: ['Ellebogen tegen je zij.', 'Strek volledig, hou 1 tel vast.', 'Enkel je onderarmen bewegen.'],
    video: 'triceps pushdown form',
  },
  {
    id: 'overhead-triceps', name: 'Triceps extensie boven het hoofd', pattern: 'arms', muscles: ['triceps'],
    locations: ['home', 'gym'], load: 'db_single', repRange: [10, 15], start: 8,
    stress: { elleboog: 2, schouder: 1 },
    tips: ['Dumbbell met beide handen achter je hoofd.', 'Ellebogen wijzen naar voren, niet opzij.', 'Rustig zakken.'],
    video: 'overhead dumbbell triceps extension form',
  },
  // ── Conditie (afsluiter / thuiscardio) ──────────────────────────────
  {
    id: 'kb-swing', name: 'Kettlebell swing', pattern: 'conditioning', muscles: ['bilspieren', 'hamstrings', 'core'],
    locations: ['home', 'gym'], load: 'kb', repRange: [12, 20], start: 12,
    stress: { onderrug: 2, heup: 1, schouder: 1 },
    tips: ['Het is een heupbeweging, geen squat.', 'Knal je heupen naar voren; armen hangen los.', 'Kettlebell tot borsthoogte, niet hoger.'],
    video: 'kettlebell swing form beginner',
  },
];

export const EXERCISES: ReadonlyMap<string, Exercise> = new Map(E.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise {
  const ex = EXERCISES.get(id);
  if (!ex) throw new Error(`Onbekende oefening: ${id}`);
  return ex;
}

export function videoUrl(ex: Exercise): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.video)}`;
}

/** Maximale belasting van een oefening op een zone (0 = geen). */
export function stressOn(ex: Exercise, zone: Zone): number {
  return ex.stress[zone] ?? 0;
}

/** Verwante patronen die dezelfde spieren trainen, als het eigen patroon niet kan. */
export const RELATED: Partial<Record<Pattern, Pattern>> = {
  pull_v: 'pull_h',
  pull_h: 'pull_v',
  push_v: 'push_h',
  push_h: 'push_v',
  squat: 'lunge',
  lunge: 'squat',
  legs_iso: 'hinge',
  conditioning: 'hinge',
};

/**
 * Alternatieven voor dezelfde spiergroep (zelfde bewegingspatroon), voor "Toestel bezet"
 * of een blessure. Gesorteerd: zelfde laadsoort eerst, dan op lage belasting.
 */
export function alternativesFor(
  id: string,
  location: Location,
  opts: { exclude?: string[]; pattern?: Pattern } = {},
): Exercise[] {
  const ex = getExercise(id);
  const pattern = opts.pattern ?? ex.pattern;
  const exclude = new Set([id, ...(opts.exclude ?? [])]);
  const totalStress = (e: Exercise) => Object.values(e.stress).reduce((a, b) => a + (b ?? 0), 0);
  const candidates = (pat: Pattern) =>
    [...EXERCISES.values()].filter((e) => e.pattern === pat && e.locations.includes(location) && !exclude.has(e.id));
  let list = candidates(pattern);
  // Niets met hetzelfde patroon (bv. verticaal trekken thuis)? Dan een verwant patroon.
  if (list.length === 0 && RELATED[pattern]) list = candidates(RELATED[pattern]!);
  return list
    .sort((a, b) => {
      const sameLoadA = a.load === ex.load ? 0 : 1;
      const sameLoadB = b.load === ex.load ? 0 : 1;
      return sameLoadA - sameLoadB || totalStress(a) - totalStress(b) || a.name.localeCompare(b.name);
    });
}
