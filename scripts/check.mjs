#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = require(join(ROOT, 'data', 'kb.js'));
const SC = require(join(ROOT, 'search-core.js'));
const index = SC.buildIndex(KB);

const cases = [
  ['无遮还是非遮', 'faq', '俱不承认'],
  ['什么是净见量', 'faq', '净见量'],
  ['五蕴对应五方佛的方位跟刹土有关系吗', 'faq', '毗卢遮那'],
  ['想蕴对应阿弥陀佛跟缘起有什么关系', 'faq', '妙观察智'],
  ['本尊即是了义法身，非不了义色身', 'faq', '了义法身'],
  ['入定有没有执着', 'faq', '善证无执'],
  ['观察修还是安住修', 'faq', '观察'],
  ['什么是单空', 'faq', '无遮空性'],
  ['一水四见说明什么', 'faq', '现基'],
  ['自解脱是什么意思', 'faq', '自解脱'],
  ['今天天气怎么样', 'none', '暂未覆盖'],
];

let failed = 0;
let caseFailed = 0;
for (const [q, type, contains] of cases) {
  const a = SC.answer(q, KB, index);
  const okType = a.type === type;
  const okText = !contains || (a.conclusion || '').includes(contains);
  if (!okType || !okText) {
    failed++;
    caseFailed++;
    console.error(
      `FAIL  ${q}\n  expected ${type}/${contains}, got ${a.type}/${a.conclusion}`
    );
  } else {
    console.log(`ok    ${q} -> ${a.type}`);
  }
}

// 原文必须可追溯到章节或术语条目
const withOriginal = SC.answer('什么是现基', KB, index);
if (!withOriginal.original) {
  failed++;
  console.error('FAIL  检索结果缺少原文');
}

// 每首颂词都要有白话简答，且讲解标题不得混入“般若”页眉
const untranslated = (KB.verses || []).filter(
  (v) => !v.translation || v.translation.trim().length < 20
);
if (untranslated.length) {
  failed++;
  console.error(`FAIL  缺少颂词白话翻译: ${untranslated.map((v) => v.id).join(', ')}`);
}
const boreHeading = (KB.commentary || []).filter((c) => (c.heading || '').trim() === '般若');
if (boreHeading.length) {
  failed++;
  console.error(`FAIL  讲解标题混入“般若”: ${boreHeading.length} 段`);
}

// 颂词简答保持简短，词释最多一条
const verbose = [];
for (const v of KB.verses || []) {
  const a = SC.answer(v.text.replace(/\n/g, ''), KB, index);
  if ((a.conclusion || '').length > 180 || (a.points || []).length > 1) {
    verbose.push(`${v.id}(${(a.conclusion || '').length}字/${(a.points || []).length}条)`);
  }
}
if (verbose.length) {
  failed++;
  console.error(`FAIL  颂词简答过长或词释过多: ${verbose.slice(0, 10).join(', ')}`);
}

console.log(
  `\n[check] ${cases.length - caseFailed}/${cases.length} passed; units=${KB.units.length} faq=${KB.faq.length} verses=${KB.verses.length}`
);
process.exit(failed ? 1 : 0);
