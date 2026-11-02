#!/usr/bin/env node
/**
 * 合并 data/translate/out-XX.json 为 data/verse-translations.json。
 * 校验每个颂词都有一句非空白话翻译。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = JSON.parse(readFileSync(join(ROOT, 'data', 'kb.json'), 'utf8'));
const ids = new Set(KB.verses.map((v) => v.id));

const merged = {};
let failed = 0;
for (let i = 1; i <= 8; i++) {
  const file = join(ROOT, 'data', 'translate', `out-${String(i).padStart(2, '0')}.json`);
  if (!existsSync(file)) {
    console.error(`[merge] missing ${file}`);
    failed++;
    continue;
  }
  const part = JSON.parse(readFileSync(file, 'utf8'));
  for (const [id, value] of Object.entries(part)) {
    if (!ids.has(id)) {
      console.error(`[merge] unknown id ${id}`);
      failed++;
      continue;
    }
    if (merged[id]) {
      console.error(`[merge] duplicate id ${id}`);
      failed++;
      continue;
    }
    const translation = String((value && value.translation) || '').trim();
    if (translation.length < 20) {
      console.error(`[merge] translation too short for ${id}: ${translation}`);
      failed++;
      continue;
    }
    const terms = (Array.isArray(value.terms) ? value.terms : [])
      .filter((t) => t && String(t.term || '').trim() && String(t.gloss || '').trim())
      .slice(0, 2)
      .map((t) => ({ term: String(t.term).trim(), gloss: String(t.gloss).trim() }));
    const verse = KB.verses.find((v) => v.id === id);
    merged[id] = { plain: verse ? verse.plain : '', translation, terms };
  }
}

for (const id of ids) {
  if (!merged[id]) {
    console.error(`[merge] missing translation for ${id}`);
    failed++;
  }
}
// 翻译按颂词正文（plain）匹配，避免解析顺序变化导致 id 漂移
for (const [id, value] of Object.entries(merged)) {
  if (!value.plain) {
    console.error(`[merge] missing plain text for ${id}`);
    failed++;
  }
}

const ordered = {};
for (const v of KB.verses) ordered[v.id] = merged[v.id];

writeFileSync(
  join(ROOT, 'data', 'verse-translations.json'),
  JSON.stringify(ordered, null, 2),
  'utf8'
);

console.log(`[merge] verses=${Object.keys(ordered).length} failed=${failed}`);
process.exit(failed ? 1 : 0);
