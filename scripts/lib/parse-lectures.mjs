/**
 * 解析《定解宝灯论讲解》（索达吉堪布 2003）文本。
 *
 * 源文本是排版后的讲记：每行约 20–30 字，行间有空行；颂词以独立
 * 两行（每行两个七言/九言半句）出现，其后是讲解。本模块负责：
 *   1. 按七问切章，记录页码；
 *   2. 识别颂词块，保留原文；
 *   3. 把讲解行重组为句子块，供检索与展开。
 */

const CHAPTERS = [
  { id: 'ch01', title: '缘起', match: /^缘起$/ },
  { id: 'ch02', title: '第一问 见解无遮或非遮', match: /^一\s*见解无遮或非遮$/ },
  { id: 'ch03', title: '第二问 声缘证二无我耶', match: /^二\s*声缘证二无我耶$/ },
  { id: 'ch04', title: '第三问 入定有无执著相', match: /^三\s*入定有无执著相$/ },
  { id: 'ch05', title: '第四问 观察修或安置修', match: /^四\s*观察修或安置修$/ },
  { id: 'ch06', title: '第五问 二谛何者为主要', match: /^五\s*二谛何者为主要$/ },
  { id: 'ch07', title: '第六问 异境何为共所见', match: /^六\s*异境何为共所见$/ },
  { id: 'ch08', title: '第七问 中观有无承认否', match: /^七\s*中观有无承认否$/ },
  { id: 'ch09', title: '结文', match: /^结文$/ },
];

const PROSE_MARKERS =
  /我们|你们|大家|因为|所以|如果|这样|那么|已经|可以|需要|应该|不会|非常|特别|尤其|比如|例如|所谓|也就是说|什么|怎么|为什么|他们|她们|自己|就是|还是|但是|虽然|然而|而且|并且|以及|的话|一样|这种|那种|其中|对于|关于|通过|进行|表示|说明|意思|问题|回答|觉得|知道|认为|能够|可能|一定|根本|完全|十分|比较|方面|时候|地方|东西|事情|以前|现在|以后|当时|然后|于是|因此|由于|不仅|不但|而且|或者|另外|此外|一般|实际上|真正|确实|当然|首先|其次|最后/;

const CLASSICAL =
  /之|其|此|彼|何|若|则|故|而|乃|以|于|所|为|亦|皆|悉|唯|云|矣|哉|兮|尔|汝|吾|无|不|非|即|谁|孰|莫|未|曾|当|应|须|能|欲|求|见|修|证|生|灭|法|性|空|现|净|执|定|解/;

const BOOK_HEADERS = new Set([
  '定解宝灯论讲解',
  '麦彭仁波切·造论',
  '索达吉堪布·译讲',
  '顶礼本师释迦牟尼佛！',
  '顶礼文殊智慧勇识！',
  '顶礼传承大恩上师！',
  '为度化一切众生，请大家发无上殊胜的菩提心！',
  '无上甚深微妙法，百千万劫难遭遇，',
  '我今见闻得受持，愿解如来真实义。',
]);

const cleanLine = (s) => s.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

const stripPunct = (s) => s.replace(/[\s，。！？；：、·“”‘’（）()《》〈〉\-—…,.!?;:"'\[\]]/g, '');

const halfParts = (line) =>
  line
    .replace(/[。！？；]$/, '')
    .split(/[，；]/)
    .map((x) => x.trim())
    .filter(Boolean);

function isHeading(line) {
  if (/^[甲乙丙丁戊己庚辛壬癸][一二三四五六七八九十百]+[、.．]/.test(line)) return true;
  if (/^[甲乙丙丁戊己庚辛壬癸][一二三四五六七八九十百]+[（(]/.test(line)) return true;
  if (/^[（(][一二三四五六七八九十]+[）)]/.test(line)) return true;
  if (/分[二三四五六七八九十]+[：:]/.test(line) && line.length < 130) return true;
  if (/^[一二三四五六七八九十]+、/.test(line) && /[；;][一二三四五六七八九十]+、/.test(line)) return true;
  if (/[：:]$/.test(line) && line.length <= 60) return true;
  return false;
}

function isVerseCandidate(line) {
  if (line.length < 8 || line.length > 28) return false;
  if (/[0-9A-Za-z]/.test(line)) return false;
  if (!/[，。！？；]$/.test(line)) return false;
  if (!line.includes('，')) return false;
  if (PROSE_MARKERS.test(line)) return false;
  const parts = halfParts(line);
  if (parts.length !== 2) return false;
  if (Math.abs(parts[0].length - parts[1].length) > 1) return false;
  if (!parts.every((p) => p.length >= 4 && p.length <= 11)) return false;
  return true;
}

function verseScore(lines) {
  let score = 0;
  const parts = lines.flatMap(halfParts);
  const lengths = parts.map((p) => p.length);
  const common = [5, 7, 9, 11].find((n) => lengths.every((l) => Math.abs(l - n) <= 1));
  if (common) score += 2;
  if (lines.length >= 2) score += 1;
  if (lines.some((l) => (l.match(new RegExp(CLASSICAL.source, 'g')) || []).length >= 2)) score += 1;
  if (/[的了吗呢吧啊这那很都也还就才又]/.test(lines.join(''))) score -= 1;
  if (PROSE_MARKERS.test(lines.join(''))) score -= 2;
  return score;
}

function splitSentences(text) {
  const out = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (/[。！？]/.test(ch)) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

function chunkSentences(sentences, maxLen = 220) {
  const chunks = [];
  let buf = '';
  for (const s of sentences) {
    if (!buf) {
      buf = s;
    } else if (buf.length + s.length <= maxLen) {
      buf += s;
    } else {
      chunks.push(buf);
      buf = s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export function parseLectures(raw) {
  const rawLines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  let current = null;
  let page = 0;
  let started = false;
  let lastHeading = '';
  const records = [];

  for (const line of rawLines) {
    if (/^\d{1,4}$/.test(line)) {
      page = Number(line);
      continue;
    }

    const chapter = CHAPTERS.find((c) => c.match.test(line));
    if (chapter) {
      current = chapter;
      started = true;
      lastHeading = chapter.title;
      continue;
    }
    if (!started) continue;

    if (BOOK_HEADERS.has(line)) continue;
    if (/^.{1,30}\s+\d{1,4}$/.test(line)) continue; // 目录行
    if (/^(B E A C O N|定 解 宝 灯 论 讲 解|2003年版)/.test(line)) continue;

    if (isHeading(line)) {
      lastHeading = line.replace(/[：:]$/, '');
      records.push({ type: 'heading', text: line, chapterId: current.id, page });
      continue;
    }

    if (isVerseCandidate(line)) {
      records.push({ type: 'verseLine', text: line, chapterId: current.id, page });
    } else {
      records.push({ type: 'text', text: line, chapterId: current.id, page, heading: lastHeading });
    }
  }

  // 合并连续颂词行
  const verses = [];
  const chunks = [];
  let verseBuffer = [];

  const flushVerse = () => {
    if (!verseBuffer.length) return;
    const lines = verseBuffer.map((r) => r.text);
    const score = verseScore(lines);
    if (score >= 3) {
      const first = verseBuffer[0];
      verses.push({
        id: `v${String(verses.length + 1).padStart(4, '0')}`,
        chapterId: first.chapterId,
        title: CHAPTERS.find((c) => c.id === first.chapterId)?.title || '',
        page: first.page,
        text: lines.join('\n'),
        plain: stripPunct(lines.join('')),
        score,
        order: verses.length + 1,
      });
    }
    verseBuffer = [];
  };

  let currentVerseId = null;

  const flushText = (textRecords) => {
    if (!textRecords.length) return;
    const text = textRecords.map((r) => r.text).join('');
    const sentences = splitSentences(text);
    const grouped = chunkSentences(sentences);
    for (const g of grouped) {
      if (g.length < 24) continue;
      if (/^[^，。！？]{0,8}[；;][一二三四五六七八九十]+、/.test(g)) continue;
      const first = textRecords[0];
      chunks.push({
        id: `c${String(chunks.length + 1).padStart(4, '0')}`,
        chapterId: first.chapterId,
        verseId: currentVerseId,
        page: first.page,
        heading: first.heading || '',
        text: g,
      });
    }
  };

  let textBuffer = [];
  for (const rec of records) {
    if (rec.type === 'verseLine') {
      flushText(textBuffer);
      textBuffer = [];
      if (verseBuffer.length >= 4) {
        flushVerse();
        currentVerseId = verses.length ? verses[verses.length - 1].id : null;
      }
      verseBuffer.push(rec);
      continue;
    }
    if (verseBuffer.length) {
      flushVerse();
      currentVerseId = verses.length ? verses[verses.length - 1].id : null;
    }
    if (rec.type === 'text') {
      textBuffer.push(rec);
    } else {
      flushText(textBuffer);
      textBuffer = [];
    }
  }
  flushText(textBuffer);
  flushVerse();

  // 给颂词挂接讲解：从该颂词之后、下一颂词之前的 chunk
  for (let i = 0; i < verses.length; i++) {
    const v = verses[i];
    const own = chunks.filter((c) => c.verseId === v.id).slice(0, 4);
    v.commentary = own;
    v.summary = own[0] ? own[0].text : '';
  }

  return {
    chapters: CHAPTERS.map((c) => ({ id: c.id, title: c.title })),
    verses,
    chunks,
  };
}
