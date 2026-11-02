#!/usr/bin/env node
/**
 * 把颂词及其讲解切成若干批次，供离线撰寫白話翻譯。
 * 输出 data/translate/in-XX.json，人工/AI 翻譯後寫入 out-XX.json。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = JSON.parse(readFileSync(join(ROOT, 'data', 'kb.json'), 'utf8'));
const OUT = join(ROOT, 'data', 'translate');
const BATCH_SIZE = 33;
const BATCHES = Math.ceil(KB.verses.length / BATCH_SIZE);

mkdirSync(OUT, { recursive: true });

for (let b = 0; b < BATCHES; b++) {
  const verses = KB.verses.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE).map((v) => ({
    id: v.id,
    chapter: v.chapterTitle,
    page: v.page,
    text: v.text,
    commentary: (v.commentary || []).map((c) => c.text),
  }));
  const name = String(b + 1).padStart(2, '0');
  writeFileSync(join(OUT, `in-${name}.json`), JSON.stringify(verses, null, 2), 'utf8');
  console.log(`[batches] in-${name}.json verses=${verses.length}`);
}
console.log(`[batches] ${BATCHES} batches -> ${OUT}`);
