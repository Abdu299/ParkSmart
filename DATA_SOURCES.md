# Datakilder og behandling

Kontrollert 8. november 2026. Dette dokumentet beskriver den faktiske implementasjonen i MVP-en.

## Kilder

| Kilde | Endepunkt | Bruk |
|---|---|---|
| Oslo kommune: gatepunkter | https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/4 | Koordinater, parkeringstype, takstgruppe og registrert kapasitet |
| Oslo kommune: parkeringsarealer | https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/5 | Identitet, merknader, endringsdato og nattforbud; hentes uten geometri i den samlede importen |
| Oslo kommune: MC | https://geodata.bymoslo.no/arcgis/rest/services/geodata/Parkering/MapServer/0 | Dedikerte MC-steder, merknader og kapasitet |
| Oslo kommune: pristabell | https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/6 | Prisbeskrivelser, takster, avgiftstider og makstid |
| Oslo kommune: publiserte priser | https://www.oslo.kommune.no/gate-transport-og-parkering/parkering/priser-og-betaling-for-parkering/ | Kontroll av eksplisitte priser og enkelte tidsopplysninger; prisrader bevares |
| Statens vegvesen | https://parkreg-open.atlas.vegvesen.no/swagger-ui/index.html?configUrl=/v3/api-docs/swagger-config | Aktive områder, adresser, operatører, kapasitet og områdetype |
| Kartverket: kommunegrense | https://ws.geonorge.no/kommuneinfo/v1/kommuner/0301/omrade | Geografisk avgrensning til Oslo, inkludert polygonhull |
| Kartverket: adresser | https://ws.geonorge.no/adresser/v1/ | Adressesøk og omtrentlig næradresse |

Kommunens kartlenker er offentlig publisert her:
https://www.oslo.kommune.no/gate-transport-og-parkering/parkering/kart-over-parkeringsplasser-i-oslo/

## Import

1. Hent alle ArcGIS-sider med eksplisitt sortering og sideforskyvning. En avbrutt import erstatter ikke datasettet.
2. Be om EPSG:4326 for parkeringspunkter. Bevar breddegrad/lengdegrad som separate, navngitte felt.
3. Hent registerets kartrespons og filtrer bort deaktiverte poster og koordinater utenfor Oslo kommunegrense.
4. Den fullstendige utviklerimporten henter aktuell versjon for hvert aktivt privat område, med fem samtidige forespørsler. Nasjonal `datafelter=alle` inneholder svært store historikker og brukes ikke.
5. Kommunale gatepunkter kobles til kommunale detaljfelt med samme kilde-ID. Takster kobles med takstgruppe.
6. Ukjente kommunale typekoder legges ikke til som vanlig offentlig gateparkering. To punkter med ukjent type 18 og merknaden «Oslo bilutleie» ble derfor utelatt.
7. Overlappende kommunale gateoppføringer i registeret legges ikke til på nytt. Private registeroppføringer beholder egne ID-er. Private og kommunale kilder kan fortsatt ha geografisk overlapp; full sammenslåing av alle fysiske anlegg er ikke bekreftet.
8. En nærliggende kommunal registeradresse kan brukes som omtrentlig navnehjelp. Den overfører aldri pris, regler eller kildeidentitet til et annet punkt. Detaljkortet kan hente en næradresse fra Kartverket.

## Pris og regler

- Rå prisbeskrivelser og publiserte prisrader bevares. Det beregnes ingen totalpris ved å anta at prisen er lineær.
- Avvik i eksplisitte priser og enkelte tidsopplysninger markeres. Dette er ikke en full revisjon av alle skiltvilkår.
- Takst 2250 hadde avvikende avgiftstid, og takst 2520 hadde 1 415 / 1 450 kr for fire uker i de to kommunale kildene ved kontroll. Automatisk avgiftstidsberegning er deaktivert for disse takstene.
- HC-/ladekapasitet angir egenskaper ved et område. Appen utleder ikke at hele området er reservert for HC eller lading.
- Et område med noen avgiftsfrie plasser blir ikke generelt grønt eller «gratis nå». Tilgangskrav er ikke bekreftet av kapasitetsfeltet.
- Dedikerte kommunale MC-plasser har avgiftsfrihet ifølge kommunens publiserte informasjon. Særskilte merknader overstyrer automatisk vurdering. Ett MC-sted har for eksempel bare onsdagstilgang i merknaden.
- Kun eksplisitt støttede avgiftsperioder beregnes automatisk. Norsk tid og norske helligdager brukes. Komplekse eller motstridende vilkår gir ukjent status.
- Det merkes ingen sanntidsledighet. Alle kapasitetstall er registrert kapasitet.

## Dekning

Oppdatert uttrekk 11. november 2026: 7 117 oppføringer, inkludert 64 MC-steder og 871 private registerområder. Blant registerområdene er 186 parkeringshus, 576 områder med registrerte HC-plasser og 248 områder med registrert lading.

Det er ikke en fullstendig oversikt over alle kommunale HC-/ladeplasser, all uregulert gratis gateparkering, midlertidige skiltendringer eller alle aktuelle tilgangsvilkår. Kart og skilt må kontrolleres før parkering. Det medfølgende datasettet er et datert uttrekk, ikke en garanti for løpende fullstendighet.

## Oppdatering og lagring

Appoppdatering henter kommunale punkter, detaljfelt, priser, kommunegrense og registerets kartrespons. Uendrede registerversjoner kan gjenbruke tidligere kapasitet og områdetype. Nye versjoner mister gamle detaljfelt til aktuell oppføring åpnes og kontrolleres.

Datasettet komprimeres og lagres i små biter på telefonen. Ny cache publiseres først når alle biter er lagret. Oppdateringsfeil beholder forrige datasett. Valgt kjøretøy og filtre lagres lokalt.

## Bruksvilkår

Parkeringsregisteret er oppført med NLOD i den offentlige datakatalogen:
https://data.norge.no/nb/datasets/7b89873c-b910-35b9-9764-48ac47437c81/parkeringsregisteret

Jeg har ikke bekreftet tydelige viderebruksvilkår eller tjenestegaranti for de konkrete kommunale kartlagene. Det må avklares med Bymiljøetaten før produksjonsbruk. At et offentlig endepunkt svarer, er ikke alene en avklaring av bruksrett.

Webforhåndsvisningen bruker Leaflet og OpenStreetMap-fliser; datagrunnlaget for parkeringsoppføringene kommer fra kildene over. Se THIRD_PARTY_NOTICES.md.


Designoppdateringen bruker nå Kartverkets bakgrunnskart som i referansen. Skiltkatalogen er kopiert uendret fra brukerens fil, ikke hentet på nytt eller juridisk revidert.
