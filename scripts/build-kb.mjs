#!/usr/bin/env node
/**
 * 将 content/ 下的 skill Markdown 解析为 data/kb.js。
 * 无第三方依赖，Node 18+。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT = join(ROOT, 'content');
const DATA = join(ROOT, 'data');

const clean = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_]{1,2}/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

const LIST_MARK = /^\s*(?:[-*]|\d+[.、])\s+/;

const paragraphsOf = (text) => {
  const out = [];
  for (const block of text.split(/\n\s*\n/)) {
    let buf = [];
    for (const line of block.split('\n')) {
      if (LIST_MARK.test(line)) {
        if (buf.length) {
          out.push(buf.join(' ').trim());
          buf = [];
        }
        out.push(line.trim());
      } else {
        buf.push(line.trim());
      }
    }
    if (buf.length) out.push(buf.join(' ').trim());
  }
  return out.filter(Boolean);
};

const bulletsOf = (text) =>
  text
    .split('\n')
    .filter((l) => LIST_MARK.test(l))
    .map((l) => clean(l.replace(LIST_MARK, '')))
    .filter(Boolean);

const termsOf = (text) =>
  [...text.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => clean(m[1]))
    .filter((t) => t.length >= 2 && t.length <= 20);

function sectionize(raw) {
  const lines = raw.split('\n');
  const sections = [];
  let current = { title: '正文', body: [] };
  for (const line of lines) {
    if (/^#{2,3}\s+/.test(line)) {
      if (current.body.length) sections.push(current);
      current = { title: line.replace(/^#{2,3}\s+/, '').trim(), body: [] };
    } else if (!/^#\s+/.test(line)) {
      current.body.push(line);
    }
  }
  if (current.body.length) sections.push(current);
  return sections;
}

function parseTable(lines) {
  const rows = lines
    .filter((l) => /^\s*\|/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => clean(c))
    );
  return rows.filter((r) => !r.every((c) => /^(-{2,}|:?-+:?)$/.test(c)));
}

// ---------- chapters ----------
const chapterFiles = existsSync(join(CONTENT, 'chapters'))
  ? readdirSync(join(CONTENT, 'chapters')).filter((f) => f.endsWith('.md')).sort()
  : [];

const chapters = [];
const units = [];

for (const file of chapterFiles) {
  const raw = readFileSync(join(CONTENT, 'chapters', file), 'utf8');
  const heading = (raw.match(/^#\s+(.+)$/m) || [])[1] || file;
  const id = (file.match(/^(ch\d+)/) || [, basename(file, '.md')])[1];
  chapters.push({ id, file, title: clean(heading), order: chapters.length + 1 });
  sectionize(raw).forEach((sec, i) => {
    const text = sec.body.join('\n').trim();
    if (!text) return;
    units.push({
      id: `${id}-s${i + 1}`,
      chapterId: id,
      chapterTitle: clean(heading),
      section: clean(sec.title),
      text: clean(text),
      paragraphs: paragraphsOf(text).map(clean),
      bullets: bulletsOf(text),
      terms: [...new Set(termsOf(text))],
      file: `content/chapters/${file}`,
    });
  });
}

// ---------- SKILL.md ----------
const skill = readFileSync(join(CONTENT, 'SKILL.md'), 'utf8');
const skillSections = sectionize(skill);
for (const [i, sec] of skillSections.entries()) {
  const text = sec.body.join('\n').trim();
  if (!text) continue;
  units.push({
    id: `overview-s${i + 1}`,
    chapterId: 'overview',
    chapterTitle: '总纲·七难题框架',
    section: clean(sec.title),
    text: clean(text),
    paragraphs: paragraphsOf(text).map(clean),
    bullets: bulletsOf(text),
    terms: [...new Set(termsOf(text))],
    file: 'content/SKILL.md',
  });
}

// ---------- patterns / cheatsheet as units ----------
for (const file of ['patterns.md', 'cheatsheet.md']) {
  if (!existsSync(join(CONTENT, file))) continue;
  const raw = readFileSync(join(CONTENT, file), 'utf8');
  const heading = (raw.match(/^#\s+(.+)$/m) || [])[1] || file;
  sectionize(raw).forEach((sec, i) => {
    const text = sec.body.join('\n').trim();
    if (!text) return;
    units.push({
      id: `${basename(file, '.md')}-s${i + 1}`,
      chapterId: basename(file, '.md'),
      chapterTitle: clean(heading),
      section: clean(sec.title),
      text: clean(text),
      paragraphs: paragraphsOf(text).map(clean),
      bullets: bulletsOf(text),
      terms: [...new Set(termsOf(text))],
      file: `content/${file}`,
    });
  });
}

// ---------- glossary ----------
const glossary = [];
if (existsSync(join(CONTENT, 'glossary.md'))) {
  const raw = readFileSync(join(CONTENT, 'glossary.md'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\*\*(.+?)\*\*(?:（[^）]*）)?——(.+)$/);
    if (!m) continue;
    const rawDef = clean(m[2]);
    const refs = [...rawDef.matchAll(/\((ch\d+(?:,\s*ch\d+)*)\)/g)].map((x) =>
      x[1].replace(/\s+/g, '')
    );
    const def = rawDef.replace(/\s*\(ch\d+(?:,\s*ch\d+)*\)\s*$/, '').trim();
    glossary.push({ term: clean(m[1]), def, refs: refs.join(',') });
  }
}

// ---------- seven questions ----------
const sevenQuestions = [];
const qSection = skillSections.find((s) => s.title.includes('七难题体系'));
if (qSection) {
  const rows = parseTable(qSection.body);
  for (const row of rows) {
    if (!/^\d+$/.test(row[0])) continue;
    sevenQuestions.push({
      n: Number(row[0]),
      question: row[1],
      answer: row[2],
      debate: row[3] || '',
    });
  }
}

// ---------- distinctions ----------
const distinctions = [];
const dSection = skillSections.find((s) => s.title.includes('不可混淆的关键区分'));
if (dSection) {
  for (const line of dSection.body) {
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*[：:]\s*(.+)$/);
    if (!m) continue;
    const pair = m[1].split('≠').map((x) => x.trim());
    distinctions.push({
      pair,
      text: clean(m[2]),
    });
  }
}

// ---------- topic index ----------
const topicIndex = [];
const tSection = skillSections.find((s) => s.title.includes('主题索引'));
if (tSection) {
  for (const line of tSection.body) {
    const m = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*→\s*(.+)$/);
    if (m) topicIndex.push({ term: clean(m[1]), refs: clean(m[2]) });
  }
}

// ---------- curated FAQ ----------
const chLabel = {
  ch01: '引言',
  ch02: '第一问',
  ch03: '第二问',
  ch04: '第三问',
  ch05: '第四问',
  ch06: '第五问',
  ch07: '第六问',
  ch08: '第七问',
  ch09: '结义',
};
const refLabel = (refs) =>
  refs
    .split(',')
    .map((r) => chLabel[r.trim()] || r.trim())
    .join('、');

for (const g of glossary) {
  g.label = g.refs ? `术语表·${refLabel(g.refs)}` : '术语表';
}

const sevenAnchors = {
  1: ['无遮', '非遮', '究竟见', '离戏', '破立'],
  2: ['声缘', '二无我', '人无我', '法无我', '阿罗汉', '饮海水'],
  3: ['入定', '执着', '无执', '无念', '和尚宗'],
  4: ['观察修', '安住修', '轮番', '定解', '安住'],
  5: ['二谛', '胜义', '世俗', '主次', '双运'],
  6: ['共同所见', '现基', '一水四见', '六道', '净见量'],
  7: ['承认', '无承认', '离戏', '大中观', '入定', '后得'],
};

const faq = [];
for (const q of sevenQuestions) {
  faq.push({
    q: q.question,
    keys: [q.question, ...(sevenAnchors[q.n] || [])],
    conclusion: q.answer,
    points: q.debate ? [`争议焦点：${q.debate}`] : [],
    source: `总纲·七难题体系 第${q.n}问`,
    kind: 'seven',
    priority: 3,
  });
}
for (const d of distinctions) {
  if (d.pair.length < 2) continue;
  faq.push({
    q: `${d.pair[0]}与${d.pair[1]}有何区别？`,
    keys: [d.pair[0], d.pair[1]],
    conclusion: d.text,
    points: [],
    source: '总纲·不可混淆的关键区分',
    kind: 'distinction',
    priority: 2,
  });
}
for (const g of glossary) {
  faq.push({
    q: `什么是${g.term}？`,
    keys: [g.term, g.def],
    conclusion: g.def,
    points: [],
    source: g.label,
    kind: 'term',
    priority: 1,
  });
}

const seeds = [
  {
    q: '无遮和非遮是什么意思？',
    keys: ['无遮', '非遮', '单空', '离戏', '究竟见'],
    conclusion:
      '无遮是只遮破所破、不引出其他法的否定；非遮是遮破的同时引出另一法。格鲁派许究竟见为无遮，部分论师许为非遮；本论则判究竟中二者俱不承认，离一切破立。',
    points: [
      '无遮近于单空，若停滞即成断见；非遮若执所引之法实有，则堕常见。',
      '自宗归于现空双运、离戏：不以无遮或非遮任一方式安立究竟。',
    ],
    source: '第一问·无遮非遮与自空他空',
  },
  {
    q: '空性是什么意思？',
    keys: ['空性', '现空双运', '离戏', '无自性', '单空', '缘起'],
    conclusion:
      '空性不是空无所有的单空，而是诸法无自性、现空双运：一切显现周遍空，一切空性周遍现。离戏大空性远离有无四边，与缘起不二。',
    points: [
      '初学者把现空看成“能破所破”是正常次第，但不能停滞于单空。',
      '若以空执断现相，即“染污龙树善宗”；若执显现实有，则堕常见。',
    ],
    source: '第一问·现空双运；第五问·二谛双运',
  },
  {
    q: '大圆满与中观应成派有何差别？',
    keys: ['大圆满', '应成派', '中观', '离戏', '空性', '本来清净', '阿底约嘎'],
    conclusion:
      '从离戏空性方面，大圆满本来清净与中观应成派无有差别；但大圆满窍诀部有其余宗派未曾有的殊胜深广密要，既不能说完全相同，也不必刻意说为差别法。',
    points: [
      '二者在“离戏”上一致，差别主要体现在证悟双运的深度与窍诀的善巧。',
      '大圆满以“大安乐”断除偏空执，空乐无别、现明觉三是大乐异名。',
    ],
    source: '第四问·大圆满与中观；第五问·九乘判分',
  },
  {
    q: '“自解”或“自解脱”是什么意思？',
    keys: ['自解', '自解脱', '诚信不净现自解', '蛇结自解', '本净'],
    conclusion:
      '“自解”即自解脱：显现不待外在对治去断除，而在现起的当下、于其自性本净中自行解脱。它不是“自己理解”，也不是把显现灭掉。',
    points: [
      '前提是定解与觉性摄持；无定解而平庸安住，是本论所破的“无念邪执”。',
      '喻如水中作画、空中云、蛇结自解：现时即解，不另求一个解脱。',
      '与第六问“现基现空不偏堕”一致：正因无自性，才能不待断除而自解。',
    ],
    source: '第六问·现基与净见量；第四问·善证无执',
  },
  {
    q: '五蕴如何对应五方佛？',
    keys: ['五蕴', '五方佛', '毗卢遮那', '宝生', '阿弥陀', '不空成就', '不动佛'],
    conclusion:
      '大幻化网系统常见配属：色蕴—毗卢遮那（中央）、受蕴—宝生（南方）、想蕴—阿弥陀（西方）、行蕴—不空成就（北方）、识蕴—不动佛（东方），同时对应五智。',
    points: [
      '方位是法性方位，不是地理坐标；五蕴五大的本净即五佛五刹土。',
      '净见量见“器情现尊”，是依教理抉择的定解见，不是凭空观想。',
      '各传承在色蕴与识蕴的配属上略有开合，义理一致。',
    ],
    source: '第六问·净见量；《大幻化网续》',
  },
  {
    q: '想蕴为什么对应阿弥陀佛？与缘起有什么关系？',
    keys: ['想蕴', '阿弥陀佛', '缘起', '妙观察智', '极乐世界', '莲花部'],
    conclusion:
      '想蕴的清净本性是妙观察智，阿弥陀佛（西方莲花部）正是妙观察智的自性。想蕴取相、施设名言；清净时即如实照见诸法自共相与因果差别，这正是缘起的智慧面。',
    points: [
      '染污的想蕴成遍计执著，清净的想蕴成妙观察智，同一心所迷悟之别。',
      '极乐世界是法藏比丘愿力与众生净业共同感现的缘起法，不是无因生。',
      '若把西方、极乐执为实有方所，是常见；若否定其缘起显现，是断见。',
    ],
    source: '第六问·净见量；第五问·二谛双运',
  },
  {
    q: '“本尊即是了义法身，非不了义色身”怎么理解？',
    keys: ['本尊', '了义法身', '不了义色身', '净观', '器情现尊'],
    conclusion:
      '本尊的体性是了义法身，即本净、现空双运的法性，不是凡夫所见有限无常的色身；“非色身”是否定把本尊局限、执实为色身，并不否定报化色身的显现。',
    points: [
      '依“依了义不依不了义”：法身了义，色身是应机的方便。',
      '“即”是同体：本尊的清净现分与法身，是同体面异分，不是两个东西。',
      '净观须以“器情本净”的定解为基，否则如画灯不能除暗、洗黑炭无转白。',
    ],
    source: '第五问·二谛双运；第六问·现基与净见量',
  },
  {
    q: '“一水四见”说明了什么？',
    keys: ['一水四见', '六道共同所见', '现基', '观现世量', '净见量'],
    conclusion:
      '同一对境，六道所见不同，说明没有偏于一边的固定共同所见境；共同所见是“现空不偏堕”的现基，随各自业力习气而现为脓血、水、甘露等。',
    points: [
      '现基非单空、非实有显现；正因空性，一者才可现种种。',
      '观现世量（凡夫）→净见量（圣者）→究竟一量（佛），愈上愈为正量。',
      '若执水或潮湿为实有共同所见，都无法成立六道所见差异。',
    ],
    source: '第六问·一水四见',
  },
  {
    q: '什么是净见量？',
    keys: ['净见量', '观现世量', '二种正量', '清净刹土'],
    conclusion:
      '净见量是见清净世俗的圣者正量：以教证理证抉择外器内情的究竟本性为清净刹土与本尊。它与观现世量相对，愈上愈为正量，究竟唯佛智慧为唯一量。',
    points: [
      '净见量是定解见，不是凭仪轨文字想象；二者有天地之别。',
      '前译宁玛巴不共特法：以净见量把一切显现成立为自性清净的圣尊与刹土。',
    ],
    source: '第六问·二种正量；第一问·二种正量',
  },
  {
    q: '定解信与闻得生信有什么区别？',
    keys: ['决定胜解信', '闻得生信', '信心', '道的影像'],
    conclusion:
      '决定胜解信是依教理在自相续中引生、不可动摇的信心，能真正趣入解脱道；闻得生信只是依听闻文字而生的信心，未经抉择，是道的影像，不能到达目的地。',
    points: ['判别标准：是否经教理抉择、是否能在境缘中不动摇。'],
    source: '第一问·正道与形象道',
  },
  {
    q: '自空和他空有什么区别？',
    keys: ['自空', '他空', '单空'],
    conclusion:
      '自空主张诸法自身无自性，空性不剩一个不空的基；他空则在空基上保留一个不空的他法（如如来藏或胜义），以他法空。本论判他空若执空基实有，即堕常见。',
    points: ['关键在“空基”是否也被空掉；宁玛自宗归于现空双运、离一切戏论。'],
    source: '第一问·无遮非遮与自空他空',
  },
  {
    q: '九乘的高下以什么标准安立？',
    keys: ['九乘', '续部高下', '证悟双运', '无上瑜伽'],
    conclusion:
      '不是按胜义或世俗单方面分高下，而是以对现空双运的证悟程度：愈通达双运，世俗自相执着愈小，乘次愈高；无上瑜伽究竟证悟净等无二。',
    points: ['若抛开胜义定见、仅在世俗上观修本尊，则与外道相近。'],
    source: '第五问·九乘判分',
  },
];

for (const s of seeds) faq.push({ ...s, kind: 'seed', priority: 4 });

// ---------- aliases ----------
const aliases = {
  无遮: ['非遮', '单空', '离戏', '究竟见'],
  非遮: ['无遮', '他空'],
  大圆满: ['阿底约嘎', '本来清净', '直断', '顿超', '彻却', '脱嘎'],
  二谛: ['胜义谛', '世俗谛', '现空双运'],
  空性: ['现空', '离戏', '单空', '无自性'],
  观察修: ['安住修', '定解', '轮番', '寂止'],
  安住修: ['观察修', '寂止', '定解'],
  自解脱: ['自解', '本净', '大圆满'],
  净见量: ['观现世量', '清净刹土', '本尊', '二种正量'],
  五蕴: ['五方佛', '五智', '刹土', '大幻化网'],
  本尊: ['了义法身', '净观', '器情现尊'],
  缘起: ['性空', '因果', '名言', '假立'],
  声缘: ['阿罗汉', '人无我', '法无我'],
  如来藏: ['光明', '本净', '佛性'],
  定解: ['胜解信', '决定胜解信', '闻得生信'],
  一水四见: ['现基', '共同所见', '观现世量'],
};

const kb = {
  meta: {
    title: '《定解宝灯论》问答',
    subtitle: '基于七难题框架的知识库检索，给出简要回答与出处',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    disclaimer:
      '本页回答由本地知识库检索合成，仅供学习参考，非法师开示，不能替代闻思原文与依止善知识。',
  },
  chapters,
  units,
  glossary,
  faq,
  aliases,
  sevenQuestions,
  distinctions,
  topicIndex,
};

mkdirSync(DATA, { recursive: true });

const payload = JSON.stringify(kb, null, 0);
const js = `/* 自动生成，请勿手改。运行 node scripts/build-kb.mjs 重新生成。 */\n(function (root, factory) {\n  var KB = factory();\n  if (typeof module === 'object' && module.exports) module.exports = KB;\n  else root.KB = KB;\n})(typeof globalThis !== 'undefined' ? globalThis : this, function () {\n  return ${payload};\n});\n`;
writeFileSync(join(DATA, 'kb.js'), js, 'utf8');
writeFileSync(join(DATA, 'kb.json'), payload, 'utf8');

console.log(
  `[build-kb] chapters=${chapters.length} units=${units.length} glossary=${glossary.length} faq=${faq.length} -> data/kb.js (${(js.length / 1024).toFixed(1)} KB)`
);
