// Generates src/lib/data/timezone-countries.ts from the IANA tz database
// (zone.tab) - maps each IANA timezone to its country's English display name,
// so the timezone picker can be searched by country as well as city/region.
//
// Run:  node scripts/gen-timezone-countries.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const TAB = '/usr/share/zoneinfo/zone.tab';
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const map = {};
for (const line of readFileSync(TAB, 'utf8').split('\n')) {
	if (!line || line.startsWith('#')) continue;
	const [code, , tz] = line.split('\t');
	if (!code || !tz) continue;
	let country = code.trim();
	try {
		country = regionNames.of(code.trim()) || country;
	} catch {
		/* unknown code - keep the raw code */
	}
	map[tz.trim()] = country;
}

const keys = Object.keys(map).sort();
let out =
	'// AUTO-GENERATED from the IANA tz database (zone.tab) - do not edit by hand.\n' +
	'// IANA timezone → country (English). Regenerate: node scripts/gen-timezone-countries.mjs\n' +
	'export const TIMEZONE_COUNTRY: Record<string, string> = {\n';
for (const k of keys) out += `\t${JSON.stringify(k)}: ${JSON.stringify(map[k])},\n`;
out += '};\n';

mkdirSync('src/lib/data', { recursive: true });
writeFileSync('src/lib/data/timezone-countries.ts', out);
console.log(`wrote ${keys.length} entries to src/lib/data/timezone-countries.ts`);
