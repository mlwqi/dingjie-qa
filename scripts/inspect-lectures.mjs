#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLectures } from './lib/parse-lectures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(ROOT, 'content/lectures/suodaji-2003.txt'), 'utf8');
const { verses, chunks } = parseLectures(raw);

const byChapter = {};
for (const v of verses) byChapter[v.chapterId] = (byChapter[v.chapterId] || 0) + 1;

const lines = [];
lines.push(`verses=${verses.length} chunks=${chunks.length}`);
lines.push(`byChapter=${JSON.stringify(byChapter)}`);
lines.push(`known: 奇哉=${verses.filter((v) => v.plain.includes('奇哉趋入深实相')).length} 诚信不净=${verses.filter((v) => v.plain.includes('诚信不净现自解')).length}`);
lines.push('');
for (const v of verses.slice(0, 60)) {
  lines.push(`[${v.id}] ${v.chapterId} p${v.page} score=${v.score}`);
  lines.push(v.text.replace(/\n/g, ' / '));
  lines.push(`  讲解：${(v.summary || '').slice(0, 90)}`);
}
lines.push('');
lines.push('--- chunks sample ---');
for (const c of chunks.slice(0, 12)) {
  lines.push(`[${c.id}] ${c.chapterId} v=${c.verseId || '-'} p${c.page} ${c.heading}`);
  lines.push(`  ${c.text.slice(0, 140)}`);
}

writeFileSync(join(ROOT, 'data/lectures-sample.txt'), lines.join('\n'), 'utf8');
console.log(`verses=${verses.length} chunks=${chunks.length} byChapter=${JSON.stringify(byChapter)}`);
console.log('wrote data/lectures-sample.txt');
