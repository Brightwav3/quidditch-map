#!/usr/bin/env node
// Usage: npm run add -- followers_1.json or followers_1.html [--dry-run], or list.txt [--dry-run] [--oldest-first]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFollowers, parseExport, parseExportHtml, mergeFollowers } from './parse-followers.mjs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('Usage: npm run add -- list.txt [--dry-run] [--oldest-first]'); process.exit(1); }

const dataPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'followers.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const source = readFileSync(file, 'utf8'), isExport = file.endsWith('.json');
const { handles, skipped } = isExport ? { handles: parseExport(JSON.parse(source)), skipped: [] } : file.endsWith('.html') ? { handles: parseExportHtml(source), skipped: [] } : parseFollowers(source);
const { followers, added, overlap } = mergeFollowers(data.followers, handles, { oldestFirst: isExport || args.includes('--oldest-first') });

console.log(`Read ${handles.length} handles. ${overlap} already seated, ${added.length} new, ${followers.length} total.`);
if (skipped.length) console.log(`Could not read ${skipped.length} lines: ${skipped.slice(0, 10).join(', ')}`);
if (added.length && !overlap) console.log('Warning: no pasted handle was already seated, so this list may leave a gap. Paste far enough back to overlap.');

if (args.includes('--dry-run')) { console.log('Dry run: nothing was changed.'); process.exit(0); }
data.followers = followers;
writeFileSync(dataPath, `{\n  "arena": ${JSON.stringify(data.arena ?? '')},\n  "first100": ${JSON.stringify(data.first100 ?? [])},\n  "followers": [\n${followers.map(h => `    ${JSON.stringify(h)}`).join(',\n')}\n  ]\n}\n`);
console.log('Saved data/followers.json.');
