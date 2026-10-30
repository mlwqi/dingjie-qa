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
for (const [q, type, contains] of cases) {
  const a = SC.answer(q, KB, index);
  const okType = a.type === type;
  const okText = !contains || (a.conclusion || '').includes(contains);
  if (!okType || !okText) {
    failed++;
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

console.log(
  `\n[check] ${cases.length - failed}/${cases.length} passed; units=${KB.units.length} faq=${KB.faq.length}`
);
process.exit(failed ? 1 : 0);
