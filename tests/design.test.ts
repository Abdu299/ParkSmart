import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../assets/design/reference.html',import.meta.url),'utf8');
const output=readFileSync(new URL('../assets/design/parksmart.html',import.meta.url),'utf8');
function signs(html:string){return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.startsWith('const SIGN_GUIDE='));}
test('All original sign images, text, sources and 298 signs are preserved byte for byte',()=>{
 assert.equal(signs(output),signs(source));const data=JSON.parse(signs(output)!.slice('const SIGN_GUIDE='.length).replace(/;\s*$/,''));assert.equal(data.length,298);
});
test('Every original page is retained with profile login and a working AI chat shell',()=>{
 for(const id of [...source.matchAll(/<section id="([^"]+)"/g)].map(m=>m[1]))assert.ok(output.includes(`<section id="${id}"`),id);
 assert.ok(output.includes('Spør om parkering …'));assert.ok(output.includes('submitAiQuestion(event)'));assert.ok(output.includes('ai-keyboard-open'));assert.ok(output.includes('visualViewport'));assert.ok(output.includes('Logg inn for å lagre favoritter og parkeringsvalg.'));
 assert.ok(output.includes('requestHomeLocation()'));assert.ok(!output.includes('<span id="homearea">Oslo sentrum</span>'));
 assert.ok(output.includes("parkingMap.hasLayer(parkingMap._popup)"));
 assert.ok(output.includes("parkingMap.on('popupclose'"));
 assert.ok(output.includes('GRATIS NÅ'));assert.ok(output.includes('parking-free-now'));
 assert.ok(output.includes('submitAuthLogin(event)'));assert.ok(output.includes('submitAuthRegistration(event)'));
 assert.ok(output.includes('toggleAuthPassword'));assert.ok(output.includes('Glemt passord?'));
 assert.ok(!output.includes('Innlogging kommer i en senere versjon.'));
 assert.ok(output.includes('Favorittplasser'));assert.ok(output.includes('Ingen favorittplasser funnet'));
 assert.ok(output.includes("setParkSmartTheme('system')"));assert.ok(output.includes("setProfileVehicle('MC')"));
 assert.ok(output.includes('resetSignedInPassword()'));
 assert.ok(output.includes('Personlige opplysninger'));assert.ok(output.includes('Slett konto'));
 assert.ok(output.includes('profile-action-danger profile-action-soon'));assert.ok(output.includes('type="button" disabled'));
 assert.ok(output.includes('favoriteButton(p.id'));assert.ok(output.includes('toggleFavorite'));
 assert.ok(output.includes('<section id="favorites"'));assert.ok(output.includes('openFavoritesPage()'));
 assert.ok(output.includes('favoriteSearch'));assert.ok(output.includes('favoriteAreaFilters'));
 assert.ok(output.includes('toggleFavoriteArea'));assert.ok(output.includes('favoriteBrowseList'));
 assert.ok(output.includes('favorite-trash'));assert.ok(output.includes('requestFavoriteDelete'));
 assert.ok(output.includes('Vil du faktisk slette'));assert.ok(output.includes('parksmart-favorites:'));
 assert.ok(output.includes('data-tab="scan"'));assert.ok(output.includes('<span>Skann skilt</span>'));assert.ok(output.includes('openScanTab()'));
 assert.ok(output.includes('scanAiPending'));assert.ok(output.includes('analyzeSignPhotoWithAi'));
 assert.ok(output.includes("target: 'ai'"));assert.ok(output.includes('Forklar dette parkeringsskiltet'));
 assert.ok(output.includes('ai-message-photo'));assert.ok(output.includes('ai-sign-guide-card'));
 assert.ok(output.includes('findGuideSign'));assert.ok(output.includes('openGuideSign(sign.id)'));
 assert.ok(output.includes('const parking = signOnly ? [] : relevantParking(question)'));
});
