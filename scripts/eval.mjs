#!/usr/bin/env node
/**
 * 问答回归评测。覆盖：颂词、七难题、术语、二谛/宗派辨析、修法、
 * 讲解检索、无关问题、低置信度兜底。
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KB = require(join(ROOT, 'data', 'kb.js'));
const SC = require(join(ROOT, 'search-core.js'));
const index = SC.buildIndex(KB);

const cases = [
  // 颂词：必须返回颂词卡，并带讲解
  { q: '诚信不净现自解', types: ['verse'], verse: '诚信不净现自解', contains: '自解脱' },
  { q: '奇哉趋入深实相', types: ['verse'], verse: '奇哉趋入深实相', contains: '定解' },
  { q: '现有清净之法身', types: ['verse'], verse: '现有清净之法身', contains: '法身' },
  { q: '若无汝则于此世', types: ['verse'], verse: '若无汝则于此世', contains: '定解' },
  { q: '能解困心疑网者', types: ['verse'], verse: '能解困心疑网者' },

  // 七难题
  { q: '无遮还是非遮', types: ['faq'], contains: '俱不承认' },
  { q: '声缘阿罗汉证法无我吗', types: ['faq'], contains: '人无我' },
  { q: '入定有没有执着', types: ['faq'], contains: '善证无执' },
  { q: '观察修还是安住修', types: ['faq'], contains: '轮番' },
  { q: '二谛哪个更重要', types: ['faq'], contains: '无主次' },
  { q: '六道共同所见是什么', types: ['faq'], contains: '现基' },
  { q: '离戏大中观有没有承认', types: ['faq'], contains: '无承认' },

  // 术语与辨析
  { q: '什么是净见量', types: ['faq'], contains: '清净' },
  { q: '观现世量和净见量有什么区别', types: ['faq'], contains: '净见量' },
  { q: '什么是单空', types: ['faq'], contains: '无遮' },
  { q: '自解脱是什么意思', types: ['faq'], contains: '自解脱' },
  { q: '本尊即是了义法身，非不了义色身', types: ['faq'], contains: '了义法身' },
  { q: '五蕴对应五方佛的方位跟刹土有关系吗', types: ['faq'], contains: '毗卢遮那' },
  { q: '想蕴对应阿弥陀佛跟缘起有什么关系', types: ['faq'], contains: '妙观察智' },
  { q: '一水四见说明什么', types: ['faq'], contains: '现基' },
  { q: '什么是决定胜解信', types: ['faq'], contains: '定解' },
  { q: '他空和自空有什么区别', types: ['faq'], contains: '自空' },
  { q: '大圆满和应成派有何差别', types: ['faq'], contains: '无有差别' },
  { q: '九乘怎么分高下', types: ['faq'], contains: '双运' },
  { q: '什么是现基', types: ['faq'], contains: '现基' },
  { q: '什么是二谛', types: ['faq'], contains: '二谛' },
  { q: '什么是本来清净', types: ['faq'], contains: '清净' },
  { q: '什么是大清净', types: ['faq'], contains: '清净' },

  // 讲解检索与展开
  { q: '为什么说显现即是空性', types: ['faq', 'commentary'], contains: '现空' },
  { q: '为什么入定不能有执着', types: ['faq', 'commentary'], contains: '无执' },
  { q: '净见量为什么见水为佛母', types: ['faq', 'commentary'], contains: '佛母' },
  { q: '什么是如来藏', types: ['commentary', 'faq', 'term'], contains: '如来藏' },
  { q: '什么是缘起性空', types: ['faq', 'commentary'], contains: '缘起' },
  { q: '布施的功德', types: ['commentary', 'faq'], contains: '布施' },

  // 无关问题必须明确说未覆盖，不得硬答
  { q: '今天天气怎么样', types: ['none'], contains: '未覆盖' },
  { q: '如何做红烧肉', types: ['none'], contains: '未覆盖' },
  { q: '什么是量子力学', types: ['none'], contains: '未覆盖' },
];

let failed = 0;
for (const c of cases) {
  const a = SC.answer(c.q, KB, index);
  const typeOk = c.types.includes(a.type);
  const text = [a.conclusion, a.verse, ...(a.points || []), ...(a.sections || []).map((s) => s.text)]
    .filter(Boolean)
    .join(' ');
  const textOk = !c.contains || text.includes(c.contains);
  const verseOk = !c.verse || (a.verse || '').includes(c.verse);
  const ok = typeOk && textOk && verseOk;
  if (!ok) {
    failed++;
    console.error(
      `FAIL  ${c.q}\n  type=${a.type} (want ${c.types.join('/')}) textOk=${textOk} verseOk=${verseOk}\n  got: ${a.conclusion}`
    );
  } else {
    console.log(`ok    ${c.q} -> ${a.type}`);
  }
}

console.log(`\n[eval] ${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
