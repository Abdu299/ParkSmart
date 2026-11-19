# ParkSmart – oppdatert navigasjon og mobiloppsett

## Denne oppdateringen

- Én felles bunnmeny ligger utenfor de enkelte sidene, slik at kart, lister og rulling ikke kan dekke den.
- 44 sidevisninger er kontrollert i Chromium: Hjem, kart, Profil, AI, skiltguide, skanning, skiltdetaljer, bildeforhåndsvisning, skiltresultat, parkeringsdetaljer og betaling ved 390×740, 360×720, 320×480 og 768×900.
- Kontroller: menyen nederst i synsfeltet, ingen overlapp med sideinnhold, riktig aktiv fane, hele toppområder, tilbakeknapper på minst 44×44 og brukbart kartareal.
- Faktiske klikk gjennom felles meny, kartets utvidede liste og skiltdetaljer er prøvd.
- Den rosa posisjonsmarkøren er kontrollert med simulert GPS ved zoomnivå 12, 16 og 19 og etter filterendring. Den er 28 piksler bred med et eget lag over parkeringene.
- Toppområder, Profil, kart og skiltdetaljer er inspisert visuelt. Kartfliser ble erstattet med en nøytral testflis i layouttesten; den testen bekrefter ikke nettverkslasting av kartbakgrunn.
- Appen åpner direkte på Hjem.
- TypeScript, lint og alle 19 tester: bestått.
- Expo Doctor: alle 20 kontroller bestått. SDK 58-pakker er oppdatert til kompatible patchversjoner (Expo 58.0.24).
- Eksport med de oppdaterte pakkene for iOS, Android og web: bestått.
- Se `qa/layout-validation.json` for målinger.

Statuslinjefarge og trygge skjermkanter håndteres av native SafeAreaView og StatusBar. Dette er typesjekket, men fysisk Expo Go-testing på iPhone/Android gjenstår.

## Tidligere funksjonskontroll

- TypeScript og Expo ESLint: bestått.
- 19 tester: bestått, inkludert bytekontroll av alle 298 skilt og bevaring av alle referansesidene.
- Nettleserflyter: hjemsted byttes via posisjonsbro, profil/AI viser innlogging, skiltguide og detaljer virker, flere parkeringstyper kan velges, MC gir 64 dedikerte steder, og handlinger sender meldinger for kopiering, navigasjon og kameravalg.
- Hjem og skiltdetaljer er inspisert visuelt mot referansen. Referansens bilder og stilark er gjenbrukt direkte.
- Brukerens posisjon er simulert i nettlesertesten for å kontrollere feltet og protokollen. Native API-er er typesjekket og pakket, men ikke fysisk testet.
- Automatisk skiltanalyse og faktisk innlogging er ikke aktivert. Ingen OpenAI-nøkkel eller backend er nødvendig.

Gjeldende grensesnittkontroll ligger i qa/design-validation.json. Den tidligere parkeringslogikken er beholdt med egne tester.
