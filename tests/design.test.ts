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
 assert.ok(output.includes("parkingMap.on('moveend',()=>{if(!parkingMap._popup)drawParking();});"));
 assert.ok(output.includes('GRATIS NÅ'));assert.ok(output.includes('parking-free-now'));
 assert.ok(output.includes('submitAuthLogin(event)'));assert.ok(output.includes('submitAuthRegistration(event)'));
 assert.ok(output.includes('toggleAuthPassword'));assert.ok(output.includes('Glemt passord?'));
});
