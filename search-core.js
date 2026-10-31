/* 中文检索与简要回答合成。浏览器与 Node 通用。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SearchCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STOP = new Set(
    '的 了 是 在 和 与 或 及 之 其 等 就 都 而 也 很 更 最 被 把 让 给 对 从 到 于 以 为 因 故 则 即 此 彼 我 你 他 她 它 们 这 那 个 些 什么 怎么 怎样 如何 为什么 为何 请问 请 解释 说说 一下 一个 一种 可以 能否 是否 有关 关系 有没有 意思 含义 意义 概念 定义 内容 指什么 吗 呢 吧 啊 呀 嘛 着 过 地 得 所 者 亦 又 再 还 才 只 不 没 没有 多 少 大 小 中 上 下 前 后 里 外'.split(
      /\s+/
    )
  );

  const FUNC_CHARS = new Set('的了是在和与之其等都而也吗呢吧啊呀嘛着过地得所亦又再还才只'.split(''));

  let segmenter = null;
  function getSegmenter() {
    if (segmenter !== null) return segmenter;
    try {
      segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    } catch (e) {
      segmenter = false;
    }
    return segmenter;
  }

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, ' ')
      .trim();
  }

  function normalizePlain(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]+/gu, '');
  }

  function tokenize(s) {
    const text = normalize(s);
    const out = new Set();
    if (!text) return [];
    const seg = getSegmenter();
    if (seg) {
      for (const part of seg.segment(text)) {
        const t = part.segment.trim();
        if (part.isWordLike && t.length >= 2 && !STOP.has(t)) out.add(t);
      }
    }
    for (const run of text.match(/[\u4e00-\u9fff]+/g) || []) {
      if (run.length === 1) {
        if (!STOP.has(run)) out.add(run);
        continue;
      }
      for (let i = 0; i < run.length - 1; i++) {
        const bigram = run.slice(i, i + 2);
        if (FUNC_CHARS.has(bigram[0]) || FUNC_CHARS.has(bigram[1])) continue;
        if (!STOP.has(bigram)) out.add(bigram);
      }
      if (run.length <= 8 && !STOP.has(run)) out.add(run);
    }
    for (const w of text.match(/[a-z0-9]{2,}/g) || []) out.add(w);
    return [...out];
  }

  function clip(s, max) {
    let t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const idx = Math.max(
      cut.lastIndexOf('。'),
      cut.lastIndexOf('；'),
      cut.lastIndexOf('！'),
      cut.lastIndexOf('？')
    );
    return (idx > max * 0.45 ? cut.slice(0, idx + 1) : cut + '…').trim();
  }

  function overlapCount(tokens, set) {
    let n = 0;
    for (const t of tokens) if (set.has(t)) n++;
    return n;
  }

  function longestCommonSubstring(a, b) {
    if (!a || !b) return 0;
    let best = 0;
    let prev = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      const cur = new Array(b.length + 1).fill(0);
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best) best = cur[j];
        }
      }
      prev = cur;
    }
    return best;
  }

  function splitSentences(text) {
    const out = [];
    let buf = '';
    for (const ch of String(text || '')) {
      buf += ch;
      if (/[。！？]/.test(ch)) {
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }

  const SUMMARY_KEYWORDS = [
    '自解', '解脱', '法身', '净见', '清净', '不净', '现空', '大清净', '定解',
    '金刚', '光明', '如来藏', '空性', '缘起', '二谛', '无遮', '非遮', '执著',
    '观察', '安住', '本净', '坛城', '刹土', '五蕴', '五佛', '本尊',
  ];

  function pickSummary(text, tokens, sourceText, sourcePlain) {
    const all = splitSentences(text);
    if (!all.length) return String(text || '');
    const complete = all.filter((s) => /[。！？][”’"']?$/.test(s.trim()));
    const sents = complete.length ? complete : all;
    const plainOf = (s) => s.replace(/[\s\p{P}\p{S}]+/gu, '');
    const srcPlain = sourcePlain || plainOf(sourceText || '');
    const pool = sents.filter((s) => {
      const sp = plainOf(s);
      if (!sp) return false;
      if (srcPlain && sp.length >= 8 && srcPlain.includes(sp)) return false;
      return true;
    });
    const pickPool = pool.length ? pool : sents;
    const src = sourceText || '';
    let bestIdx = 0;
    let bestScore = -1;
    pickPool.forEach((s, i) => {
      let sc = overlapCount(tokenize(s), tokens);
      if (/此颂|所谓|意思是|应知|即应|也就是说/.test(s)) sc += 0.4;
      for (const kw of SUMMARY_KEYWORDS) {
        if (src.includes(kw) && s.includes(kw)) sc += 1.2;
      }
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    });
    let out = pickPool[bestIdx] || '';
    if (out.length < 60 && pickPool[bestIdx + 1]) out += pickPool[bestIdx + 1];
    return out;
  }

  function commonPrefixLength(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  function buildIndex(kb) {
    const docs = [];

    const push = (kind, item, text, terms) => {
      const tokens = tokenize(text);
      const tf = Object.create(null);
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      docs.push({ kind, item, tf, len: tokens.length, terms: terms || [] });
    };

    for (const u of kb.units || []) {
      push(
        'unit',
        u,
        [u.chapterTitle, u.chapterTitle, u.section, u.section, (u.terms || []).join(' '), (u.terms || []).join(' '), u.text].join(' '),
        u.terms
      );
    }

    for (const c of kb.commentary || []) {
      push('commentary', c, [c.chapterTitle, c.heading || '', c.text].join(' '));
    }

    for (const v of kb.verses || []) {
      const own = (v.commentary || []).map((c) => c.text).join(' ');
      push('verse', v, [v.chapterTitle, v.text, v.summary || '', own].join(' '));
    }

    const df = new Map();
    for (const d of docs) {
      for (const t of Object.keys(d.tf)) df.set(t, (df.get(t) || 0) + 1);
    }
    const N = docs.length;
    const idf = new Map();
    for (const [t, n] of df) idf.set(t, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
    const avgdl = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, N);
    return { docs, idf, avgdl, N };
  }

  function expandQuery(query, kb) {
    const extra = new Set();
    for (const [key, list] of Object.entries(kb.aliases || {})) {
      if (query.includes(key)) {
        for (const item of list) for (const t of tokenize(item)) extra.add(t);
      }
    }
    return extra;
  }

  function bm25(doc, tokens, index, weight) {
    const k1 = 1.5;
    const b = 0.75;
    let score = 0;
    for (const t of tokens) {
      const f = doc.tf[t];
      if (!f) continue;
      const idf = index.idf.get(t) || 0;
      score += weight * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.len) / index.avgdl)));
    }
    return score;
  }

  function search(query, kb, index, limit) {
    const q = normalize(query);
    if (!q) return [];
    const qPlain = normalizePlain(query);
    const qTokens = tokenize(q);
    const extra = expandQuery(q, kb);
    const scored = [];

    for (const doc of index.docs) {
      let score = bm25(doc, qTokens, index, 1);
      if (extra.size) score += bm25(doc, extra, index, 0.35);

      let matched = 0;
      for (const t of qTokens) if (doc.tf[t]) matched++;

      let termHit = false;
      const item = doc.item;

      if (doc.kind === 'unit') {
        for (const term of item.terms || []) {
          if (term.length >= 2 && q.includes(term)) {
            score += 1.6 + Math.min(term.length, 6) * 0.2;
            termHit = true;
          }
        }
        if (/核心要点|关键概念|关键收获/.test(item.section)) score += 0.35;
        if (q.includes(item.section.replace(/\s/g, ''))) score += 1.2;
      } else if (doc.kind === 'verse') {
        const lcs = longestCommonSubstring(qPlain, item.plain || '');
        if (lcs >= 5) score += lcs * 1.1;
        if (item.plain && item.plain.includes(qPlain) && qPlain.length >= 4) score += 4;
      } else if (doc.kind === 'commentary') {
        if (qPlain.length >= 4 && item.text.includes(qPlain)) score += 2.5;
        if (item.heading && q.includes(item.heading)) score += 0.8;
      }

      if (score > 0) scored.push({ score, kind: doc.kind, item, matched, termHit });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 6);
  }

  /* ---------- FAQ ---------- */

  function anchorVariants(text) {
    const raw = String(text || '').replace(/[？?。！!，,、；;：:]/g, '').trim();
    if (!raw) return [];
    const parts = raw.split(/[（）()、·，,／/]/).map((x) => x.trim()).filter((x) => x.length >= 2);
    return [raw, ...parts];
  }

  function scoreFaq(query, faq) {
    const qTokens = new Set(tokenize(query));
    let score = 0;
    let anchors = 0;
    for (const key of faq.keys || []) {
      for (const variant of anchorVariants(key)) {
        const len = variant.length;
        if (!len) continue;
        if (query.includes(variant)) {
          anchors++;
          score += 0.8 + Math.min(len, 10) * 0.2;
        } else {
          const kt = tokenize(variant);
          if (!kt.length) continue;
          const m = overlapCount(kt, qTokens);
          if (m) score += (m / kt.length) * 0.9;
        }
      }
    }
    if (anchors === 0 && score < 1.2) return 0;

    const qn = normalize(query);
    const fqn = normalize(faq.q);
    if (qn && fqn) {
      const common = longestCommonSubstring(qn, fqn);
      if (common >= 2) score += (common / Math.min(qn.length, fqn.length)) * 2.2;
    }
    return score;
  }

  function bestFaq(query, kb) {
    let best = null;
    for (const f of kb.faq || []) {
      const s = scoreFaq(query, f);
      const p = f.priority || 0;
      if (!best || s > best.score + 0.35 || (s > best.score - 0.35 && p > best.priority)) {
        best = { faq: f, score: s, priority: p };
      }
    }
    return best && best.score >= 2.5 ? best : null;
  }

  function bestGlossary(query, kb) {
    let best = null;
    for (const g of kb.glossary || []) {
      for (const v of anchorVariants(g.term)) {
        const hit =
          v.length >= 2 &&
          (query.includes(v) || (query.length >= 3 && v.startsWith(query)));
        if (hit) {
          if (!best || v.length > best.len) best = { item: g, len: v.length };
        }
      }
    }
    return best ? best.item : null;
  }

  /* ---------- verse matching ---------- */

  function findVerse(query, kb) {
    const q = normalizePlain(query);
    if (q.length < 4) return null;
    let best = null;
    for (const v of kb.verses || []) {
      const p = v.plain || '';
      if (!p) continue;
      let lcs = longestCommonSubstring(q, p);
      if (p.includes(q) && q.length >= 4) lcs = Math.max(lcs, q.length);
      if (lcs < 5) continue;
      const ratio = lcs / Math.min(q.length, p.length);
      if (lcs < 7 && ratio < 0.6) continue;
      if (lcs < 7 && q.length > 12) continue;
      const score = lcs * 1.5 + (p.includes(q) ? 4 : 0);
      if (!best || score > best.score) best = { verse: v, score, lcs };
    }
    return best;
  }

  /* ---------- answer formatting ---------- */

  function chapterTitleOf(item) {
    return item.chapterTitle || item.title || item.chapterId || '';
  }

  function itemSource(kind, item) {
    if (kind === 'unit') return `${item.chapterTitle}·${item.section}`;
    if (kind === 'verse') return `${chapterTitleOf(item)}·p${item.page}`;
    return `${chapterTitleOf(item)}${item.page ? `·p${item.page}` : ''}`;
  }

  function itemTitle(kind, item) {
    if (kind === 'unit') return `${item.chapterTitle}·${item.section}`;
    if (kind === 'verse') return `${chapterTitleOf(item)}·颂词`;
    const ch = chapterTitleOf(item);
    const h = item.heading || '';
    if (!h || h === ch) return ch;
    return `${ch}·${h}`;
  }

  function itemOriginal(kind, item) {
    if (kind === 'verse') {
      return (
        item.text +
        (item.commentary && item.commentary.length
          ? '\n\n' + item.commentary.map((c) => c.text).join('\n\n')
          : '')
      );
    }
    if (kind === 'commentary') return `${item.heading ? item.heading + '\n\n' : ''}${item.text}`;
    return item.text;
  }

  function relatedOf(hits, excludeKey) {
    const out = [];
    for (const h of hits) {
      if (excludeKey && excludeKey === h.kind + ':' + (h.item.id || '')) continue;
      out.push({ title: itemTitle(h.kind, h.item), source: itemSource(h.kind, h.item), original: itemOriginal(h.kind, h.item) });
      if (out.length >= 2) break;
    }
    return out;
  }

  function deepSections(hits, limit, focusText) {
    const focus = new Set(tokenize(focusText || '').filter((t) => t.length >= 2));
    const scored = hits
      .filter((h) => h.kind === 'commentary')
      .map((h) => {
        if (!focus.size) return { h, f: h.matched || 0 };
        const ht = new Set(tokenize((h.item.heading || '') + ' ' + h.item.text));
        let f = 0;
        for (const t of focus) if (ht.has(t)) f++;
        return { h, f };
      })
      .filter((x) => x.f >= Math.min(2, focus.size))
      .sort((a, b) => b.f * 4 + b.h.score - (a.f * 4 + a.h.score));
    return scored.slice(0, limit || 3).map((x) => ({
      heading: x.h.item.heading || '讲解',
      text: x.h.item.text,
      source: itemSource(x.h.kind, x.h.item),
    }));
  }

  function verseAnswer(v, hits) {
    const own = v.commentary || [];
    const verseTokens = new Set(tokenize(v.text.replace(/\n/g, '')));
    const ranked = own
      .map((c) => {
        const ct = new Set(tokenize((c.heading || '') + ' ' + c.text));
        let s = overlapCount([...verseTokens], ct);
        if (/此颂|此处|也就是说|所谓|意思是|即应|应知/.test(c.text)) s += 0.6;
        return { c, s };
      })
      .sort((a, b) => b.s - a.s);
    const best = ranked.length && ranked[0].s >= 2 ? ranked[0].c : own[0];
    const ordered = best ? [best, ...own.filter((c) => c !== best)] : own;
    const summary = best ? pickSummary(best.text, verseTokens, v.text, v.plain) : v.summary || '';
    const sections = ordered.slice(0, 4).map((c) => ({
      heading: c.heading || '讲解',
      text: c.text,
      source: chapterTitleOf(v) + (c.page ? ` · p${c.page}` : ''),
    }));
    return {
      type: 'verse',
      query: '',
      title: `${chapterTitleOf(v)}·颂词`,
      verse: v.text,
      conclusion: String(summary || '').trim(),
      points: [],
      sections,
      source: `${chapterTitleOf(v)}·p${v.page}`,
      original: itemOriginal('verse', v),
      related: relatedOf(hits || [], 'verse:' + v.id),
    };
  }

  function faqAnswer(f, hits) {
    return {
      type: 'faq',
      query: '',
      title: f.q,
      conclusion: f.conclusion,
      points: (f.points || []).slice(0, 3),
      sections: deepSections(hits, 2, f.q + ' ' + f.conclusion),
      source: f.source,
      original: `${f.q}\n\n${f.conclusion}${(f.points || []).length ? '\n\n' + f.points.join('\n') : ''}`,
      related: relatedOf(hits),
    };
  }

  function termAnswer(term, hits) {
    return {
      type: 'term',
      query: '',
      title: `术语：${term.term}`,
      conclusion: term.def,
      points: [],
      sections: deepSections(hits, 2, term.term + ' ' + term.def),
      source: term.label || term.refs || '术语表',
      original: `${term.term}——${term.def}`,
      related: relatedOf(hits),
    };
  }

  function unitAnswer(hit, hits, qTokens) {
    const unit = hit.item;
    const rankedOwnBullets = (unit.bullets || [])
      .map((b) => ({ text: b, score: overlapCount(tokenize(b), qTokens) }))
      .sort((a, b) => b.score - a.score);
    const conclusion =
      rankedOwnBullets.length && rankedOwnBullets[0].score >= 2
        ? rankedOwnBullets[0].text
        : primarySentence(unit);
    const points = rankBullets(hits.slice(0, 2).map((h) => h.item), qTokens, 4)
      .filter((p) => {
        const a = p.replace(/[。；\s]/g, '');
        const b = conclusion.replace(/[。；\s]/g, '');
        return a !== b && commonPrefixLength(a, b) < 5;
      })
      .slice(0, 3);
    return {
      type: 'unit',
      query: '',
      title: `${unit.chapterTitle}·${unit.section}`,
      conclusion,
      points,
      sections: deepSections(hits, 2, unit.chapterTitle + ' ' + unit.section + ' ' + conclusion),
      source: itemSource('unit', unit),
      original: unit.text,
      related: relatedOf(hits, 'unit:' + unit.id),
    };
  }

  function commentaryAnswer(hit, hits) {
    const item = hit.item;
    const commentaryHits = hits.filter((h) => h.kind === 'commentary');
    const points = commentaryHits
      .slice(1, 4)
      .map((h) => h.item.text)
      .filter((p) => commonPrefixLength(p, item.text) < 8);
    return {
      type: 'commentary',
      query: '',
      title: itemTitle('commentary', item),
      conclusion: item.text,
      points,
      sections: deepSections(hits, 3, item.text),
      source: itemSource('commentary', item),
      original: itemOriginal('commentary', item),
      related: relatedOf(hits, 'commentary:' + item.id),
    };
  }

  function primarySentence(unit) {
    const prose = (unit.paragraphs || []).filter((p) => !/^(?:[-*|>#]|\d+[.、])/.test(p));
    const usable = prose.filter((p) => !(/[：:]$/.test(p) && p.length < 40));
    return usable[0] || (unit.bullets || [])[0] || prose[0] || (unit.paragraphs || [])[0] || '';
  }

  function rankBullets(units, qTokens, limit) {
    const seen = new Set();
    const pool = [];
    for (const u of units) {
      for (const b of u.bullets || []) {
        const key = b.slice(0, 24);
        if (seen.has(key)) continue;
        seen.add(key);
        pool.push({ text: b, score: overlapCount(tokenize(b), qTokens) });
      }
    }
    pool.sort((a, b) => b.score - a.score);
    return pool
      .filter((x) => x.score >= 2)
      .slice(0, limit)
      .map((x) => x.text);
  }

  function clarifyAnswer(hits, kb, query) {
    const seen = new Set();
    const candidates = [];
    const add = (c) => {
      if (!c.title || seen.has(c.title) || candidates.length >= 5) return;
      seen.add(c.title);
      candidates.push(c);
    };

    const faqCandidates = (kb.faq || [])
      .map((f) => ({ f, s: scoreFaq(query || '', f) }))
      .filter((x) => x.s >= 1.6)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);

    const topHit = hits[0];
    const hasSignal =
      (topHit && topHit.matched >= 2 && topHit.score >= 2.0) || faqCandidates.length > 0;
    if (!hasSignal) {
      return {
        type: 'none',
        query: '',
        conclusion:
          '本知识库暂未覆盖这个问题。可以换用论中的术语或颂词片段提问，例如“无遮非遮”“净见量”“诚信不净现自解”。',
        points: [],
        sections: [],
        source: '',
        original: '',
        related: [],
      };
    }
    for (const { f } of faqCandidates) {
      add({
        title: f.q,
        source: f.source,
        query: f.q,
        action: 'ask',
        original: `${f.q}\n\n${f.conclusion}`,
      });
    }

    if (candidates.length < 3) {
      for (const q of kb.sevenQuestions || []) {
        add({
          title: q.question,
          source: `总纲·七难题 第${q.n}问`,
          query: q.question,
          action: 'ask',
          original: `${q.question}\n\n${q.answer}`,
        });
      }
    }

    for (const h of hits) {
      if (h.kind === 'unit') {
        add({
          title: `${h.item.chapterTitle}·${h.item.section}`,
          source: '章节要点',
          action: 'open',
          original: itemOriginal(h.kind, h.item),
        });
      } else if (h.kind === 'verse') {
        const line = (h.item.text || '').split('\n')[0];
        add({
          title: line,
          source: `${chapterTitleOf(h.item)}·颂词`,
          query: line,
          action: 'ask',
          original: itemOriginal(h.kind, h.item),
        });
      }
    }

    if (!candidates.length) {
      return {
        type: 'none',
        query: '',
        conclusion:
          '本知识库暂未覆盖这个问题。可以换用论中的术语或颂词片段提问，例如“无遮非遮”“净见量”“诚信不净现自解”。',
        points: [],
        sections: [],
        source: '',
        original: '',
        related: [],
      };
    }
    return {
      type: 'clarify',
      query: '',
      conclusion: '我不确定你问的是哪一处。你可能是想问：',
      points: [],
      sections: [],
      candidates,
      source: '',
      original: '',
      related: [],
    };
  }

  function answer(query, kb, index) {
    const q = normalize(query);
    if (!q) return { type: 'empty', query };

    const hits = search(q, kb, index, 8);
    const verseMatch = findVerse(q, kb);

    // 明确引用颂词时，颂词卡优先
    if (verseMatch && (verseMatch.lcs >= 7 || verseMatch.verse.plain.includes(normalizePlain(q)))) {
      return { ...verseAnswer(verseMatch.verse, hits), query };
    }

    const faqHit = bestFaq(q, kb);
    if (faqHit) return { ...faqAnswer(faqHit.faq, hits), query };

    const term = bestGlossary(q, kb);
    if (term) return { ...termAnswer(term, hits), query };

    if (verseMatch) return { ...verseAnswer(verseMatch.verse, hits), query };

    const top = hits[0];
    const qTokens = tokenize(q);
    const coverage = top && qTokens.length ? top.matched / qTokens.length : 0;
    const strongEnough =
      top &&
      top.score >= 1.15 &&
      (top.termHit ||
        (qTokens.length <= 1 && top.matched >= 1) ||
        (qTokens.length >= 2 && coverage >= 0.55 && top.matched >= 2) ||
        (qTokens.length >= 4 && coverage >= 0.4 && top.matched >= 3));

    if (top && strongEnough) {
      if (top.kind === 'commentary') return { ...commentaryAnswer(top, hits), query };
      if (top.kind === 'verse') return { ...verseAnswer(top.item, hits), query };
      if (top.kind === 'unit') return { ...unitAnswer(top, hits, new Set(qTokens)), query };
    }

    if (top && top.score >= 2.2 && top.matched >= 2) return { ...clarifyAnswer(hits, kb, q), query };
    return { ...clarifyAnswer([], kb, q), query };
  }

  return {
    tokenize,
    normalize,
    normalizePlain,
    buildIndex,
    search,
    answer,
    clip,
    scoreFaq,
    findVerse,
  };
});
