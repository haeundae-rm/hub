import fs from 'fs';
import { readRoster, buildFromXlsx } from '../../rm/app/engine.js';
import { snapOf } from '../../rm/app/rsync.js';
const f = process.argv[2], out = {}; const u8 = fs.readFileSync(f), ros = await readRoster(u8);
for (let k = 1; k <= 26; k++) { const ds = '2026-11-' + ('0' + k).slice(-2); const r = await buildFromXlsx(u8, ds); out['jbr/' + ds] = Object.assign(snapOf(r, ros, ds, '11월.xlsx'), { at: Date.now() - (27 - k) * 864e5, by: '시험' }); }
fs.writeFileSync(process.argv[3], JSON.stringify(out)); console.log(Object.keys(out).length);
