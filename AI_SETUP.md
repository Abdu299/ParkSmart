# ParkSmart AI – gratis MVP

ParkSmart-appen sender spørsmål og eventuelle skiltbilder til en liten Cloudflare Worker. Workeren holder Gemini-nøkkelen hemmelig, sender bare relevante parkeringsdata videre og returnerer et strukturert svar til appen.

## 1. Lag en gratis Gemini-nøkkel

1. Åpne [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Logg inn og velg **Create API key**.
3. Kopier nøkkelen. Ikke legg den i Expo-appen, `.env` eller GitHub.

## 2. Publiser den gratis backenden

Fra rotmappen til ParkSmart:

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
```

Lim inn Gemini-nøkkelen når terminalen spør. Publiser deretter:

```bash
npm run deploy
```

Cloudflare skriver ut en adresse som ligner på:

```text
https://parksmart-ai.ditt-navn.workers.dev
```

## 3. Koble Expo-appen til backenden

Gå tilbake til prosjektets rotmappe:

```bash
cd ..
cp .env.example .env
```

Åpne `.env` og sett inn den ekte Worker-adressen:

```env
EXPO_PUBLIC_PARKSMART_AI_URL=https://parksmart-ai.ditt-navn.workers.dev
```

`.env` er ignorert av Git og skal ikke pushes.

## 4. Bygg designet og start appen

```bash
npm install
npm run design:build
npm run check
npx expo start --clear
```

Åpne appen i Expo Go og trykk **AI-søk** i bunnmenyen.

## Hva første versjon støtter

- Vanlige spørsmål om parkering.
- Nærmeste parkering basert på posisjonen brukeren godkjenner.
- Filtrering for gratis, MC, lading og HC før parkeringsdata sendes til AI.
- Klikkbare parkeringskort som åpner den eksisterende detaljsiden.
- Kamera og Gemini-bildeanalyse av parkeringsskilt.
- Mørk modus og den eksisterende bunnmenyen.

## Viktige begrensninger

- ParkSmart har ikke sanntidsdata om ledige plasser.
- AI-en skal bare bruke parkeringsplassene appen sender, men skilting på stedet gjelder alltid.
- Midlertidig skilting kan overstyre appdata og AI-tolkning.
- Gratis Gemini-kvote og Cloudflare-grenser kan endres.
- Worker-adressen er offentlig. Før en stor lansering bør backenden få sterkere misbruksvern og rate limiting.

## Bytte Gemini-modell

Standardmodellen står i `worker/wrangler.jsonc`. Endre `GEMINI_MODEL` og kjør `npm run deploy` igjen dersom Google endrer tilgjengelige modeller.
