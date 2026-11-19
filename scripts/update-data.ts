import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { refreshDataset } from '../src/services/data';
import type { Dataset } from '../src/domain/types';

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) setGlobalDispatcher(new EnvHttpProxyAgent());
const output = resolve('src/data/parking-oslo.json');
let previous: Dataset | undefined;
try { previous = JSON.parse(await readFile(output, 'utf8')); } catch { /* First import. */ }
const dataset = await refreshDataset(previous, console.log, !process.argv.includes('--quick'));
await mkdir(resolve('src/data'), { recursive: true });
await writeFile(`${output}.tmp`, JSON.stringify(dataset));
await rename(`${output}.tmp`, output);
const counts = {
  total: dataset.locations.length,
  mc: dataset.locations.filter(p => p.facility === 'mc').length,
  garages: dataset.locations.filter(p => p.facility === 'garage').length,
  hcAreas: dataset.locations.filter(p => (p.hcSpaces ?? 0) > 0).length,
  chargingAreas: dataset.locations.filter(p => (p.chargingSpaces ?? 0) > 0).length,
};
console.log('Lagret:', output, JSON.stringify(counts));
for (const warning of dataset.warnings) console.log(warning);
