# ParkSmart · Expo Go SDK 58

Denne utgaven bruker selve HTML-/CSS-designet fra den opplastede referansen. Designet vises i en lokal WebView i Expo, med native tilkobling til posisjon, kamera/bildevalg, utklippstavle og eksterne kartapper. Ingen ekstern nettside eller server kreves for grensesnittet.

## Start

Bruk Node.js 24 og Expo Go som støtter SDK 58. Pakk ut ZIP-filen, åpne prosjektmappen i VS Code og kjør:

```bash
npm install
npx expo start --clear
```

Skann QR-koden med Kamera på iPhone eller Expo Go på Android. Telefonen og datamaskinen må være på samme Wi-Fi. Ved nettverksproblemer kan du bruke `npx expo start --tunnel`.

## Sider og funksjoner

- Appen åpner direkte på Hjem. «Kom i gang»-siden hoppes over.
- Én felles bunnmeny med Hjem, Kart, AI-søk, Skilt og Profil er synlig på alle sidene, også i kartet, parkeringsdetaljer og skanning. Aktiv fane oppdateres når du bytter side.
- Toppområdet har lik høyde, tydelige tilbakeknapper og riktig plass til telefonens statuslinje. På undersider fortsetter den mørke toppfargen bak statuslinjen; Hjem har lys statuslinjebakgrunn.
- Hjem ber om posisjonstilgang. Der referansen viste «Oslo sentrum», vises brukerens sted fra telefonens posisjon og omvendt geokoding. Ved manglende stedsnavn vises koordinatene. Avslått tilgang merkes tydelig; trykk på feltet for å prøve igjen.
- Profil og AI-søk er innloggingsplassholdere. Ingen faktisk innlogging eller AI-søk er aktivert.
- Skiltguiden har nøyaktig de samme 298 skiltene, bildene, tekstene, søket, kategoriene og detaljsidene som den opplastede filen. Katalogen er bevart byte for byte.
- Kartet bruker de faktiske parkeringsdataene og pris-/tidslogikken fra MVP-en, med bil/MC, flere samtidige filtre, priser for elbil/øvrig bil, nærmesteliste, kildelenker, adressekopiering og Google Maps-lenker.
- Din posisjon vises med en rosa markør, hvit kant, halo og «DU ER HER». Den ligger over parkeringsmarkørene og beholder størrelsen ved zooming. «Min posisjon» henter posisjonen på nytt og sentrerer kartet.
- Kartbakgrunnen er Kartverket/Leaflet, som i referansen. Dette erstatter den forrige native kartvisningen for å bevare samme utseende.
- «Åpne kamera» og «Velg fra bilder» bruker systemets kamerabilde-/bildevelger på mobilen og viser bildet i referansens forhåndsvisning. Automatisk skiltanalyse er ikke tilkoblet. Bildet lastes ikke opp eller sendes til en AI-tjeneste.
- Sykkel- og elsparkesykkelvalgene er beholdt visuelt. Parkeringsdataene i denne MVP-en dekker bil og MC; for de andre valgene vises en tydelig beskjed.

## Data og begrensninger

Det medfølgende uttrekket er oppdatert 11. november 2026 og har 7 117 steder/strekninger, inkludert 64 MC-steder. Kilder er Oslo kommune, Statens vegvesen og Kartverket. Se DATA_SOURCES.md for opprinnelig metode og kildebegrensninger.

Det finnes ikke sanntidsledighet. Kapasitetstall er ikke ledige plasser. Gratis kapasitet i et privat område bekrefter ikke at alle har fri tilgang. HC/lading kan være egenskaper ved et område uten at hver enkelt plass er markert. Kommunale næradresser er omtrentlige; navigasjon bruker koordinater. Prisavvik og ufullstendige regler merkes. Skiltingen på stedet gjelder.

Posisjonen brukes i den aktive appen, uten posisjonshistorikk. Omvendt geokoding, kartbakgrunn og navigasjonsleverandører kan behandle forespurte koordinater.

## Oppdatere og utvikle

Oppdateringsknappen i kartet henter nye data gjennom den native integrasjonen. Et mislykket uttrekk erstatter ikke forrige datasett.

```bash
npm run data:quick
npm run data:refresh
npm run design:build
npm run check
npx expo-doctor
```

`data:quick` gjenbruker uendrede registerdetaljer. `data:refresh` henter private detaljer på nytt. Begge bygger designfilen etter import. Etter endringer i designadapteren: kjør `npm run design:build` og last appen på nytt.

Viktige filer:

- `assets/design/reference.html`: uendret opplastet referanse.
- `src/design/bridge.js`: grensesnittets kobling til eksisterende parkeringsfunksjoner og native handlinger.
- `src/design/app.css`: felles layout, toppområder og bunnmeny for mobilskjermene.
- `src/design/adapter.ts`: oversetter faktiske parkeringsdata til designets format.
- `src/design/useBridge.ts`: posisjon, omvendt geokoding, kamera/bildevalg, kopiering, søk og navigasjon.
- `scripts/build-design.ts`: bygger lokal HTML og appens dokumentpakke.
- `assets/design/parksmart.html`: ferdig HTML for lokal forhåndsvisning.
- `src/screens/ParkSmartScreen.tsx`: native Expo-skjerm.

Appen bruker Expo Router som inngang. Referansens interne sider vises i samme lokale dokument. De tidligere native kartkomponentene ligger fortsatt i prosjektet som referanse, men er ikke startskjermen.

## Verifisering

Typesjekk, lint og 19 tester er bestått. De tidligere funksjonskontrollene ligger i `qa/design-validation.json`. Oppdateringen er kontrollert i 44 sidevisninger på fire skjermstørrelser (320–768 piksler bredde), med synlig bunnmeny, riktig aktiv fane, hele overskrifter og kartplass. Markøren er kontrollert ved flere zoomnivåer og etter filtrering. Se `qa/layout-validation.json` og `VALIDATION.md`.

Fysisk Expo Go-testing av GPS, WebView, bildevelger og Google Maps-overgang på iPhone/Android gjenstår. Kameraet åpnes gjennom systemets bildevelger; det er ikke referansens nettleser-video som kjøres på mobilen.
