import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../assets/design/reference.html',import.meta.url),'utf8');
const output=readFileSync(new URL('../assets/design/parksmart.html',import.meta.url),'utf8');
function signs(html:string){return [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.startsWith('const SIGN_GUIDE='));}
test('All original sign images, text, sources and 298 signs are preserved byte for byte',()=>{
 assert.equal(signs(output),signs(source));const data=JSON.parse(signs(output)!.slice('const SIGN_GUIDE='.length).replace(/;\s*$/,''));assert.equal(data.length,298);
});
test('Every original page is retained with explicit profile and AI placeholders',()=>{
 for(const id of [...source.matchAll(/<section id="([^"]+)"/g)].map(m=>m[1]))assert.ok(output.includes(`<section id="${id}"`),id);
 assert.ok(output.includes('Logg inn for AI-søk'));assert.ok(output.includes('Logg inn for å se profilen din'));
 assert.ok(output.includes('requestHomeLocation()'));assert.ok(!output.includes('<span id="homearea">Oslo sentrum</span>'));
});
