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

  function buildIndex(kb) {
    const docs = kb.units.map((u) => {
      const weighted = [
        u.chapterTitle,
        u.chapterTitle,
        u.section,
        u.section,
        u.terms.join(' '),
        u.terms.join(' '),
        u.text,
      ].join(' ');
      const tokens = tokenize(weighted);
      const tf = Object.create(null);
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      return { unit: u, tf, len: tokens.length };
    });

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
    const qTokens = tokenize(q);
    const extra = expandQuery(q, kb);
    const scored = [];

    for (const doc of index.docs) {
      let score = bm25(doc, qTokens, index, 1);
      if (extra.size) score += bm25(doc, extra, index, 0.35);

      let matched = 0;
      for (const t of qTokens) if (doc.tf[t]) matched++;

      let termHit = false;
      const u = doc.unit;
      for (const term of u.terms) {
        if (term.length >= 2 && q.includes(term)) {
          score += 1.6 + Math.min(term.length, 6) * 0.2;
          termHit = true;
        }
      }
      if (/核心要点|关键概念|关键收获/.test(u.section)) score += 0.35;
      if (q.includes(u.section.replace(/\s/g, ''))) score += 1.2;

      if (score > 0) scored.push({ score, unit: u, matched, termHit });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit || 5);
  }

  function anchorVariants(text) {
    const raw = String(text || '').replace(/[？?。！!，,、；;：:]/g, '').trim();
    if (!raw) return [];
    const parts = raw.split(/[（）()、·，,／/]/).map((x) => x.trim()).filter((x) => x.length >= 2);
    return [raw, ...parts];
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
      if (common >= 2) {
        score += (common / Math.min(qn.length, fqn.length)) * 2.2;
      }
    }
    return score;
  }

  function bestFaq(query, kb) {
    let best = null;
    for (const f of kb.faq || []) {
      const s = scoreFaq(query, f);
      const p = f.priority || 0;
      if (
        !best ||
        s > best.score + 0.35 ||
        (s > best.score - 0.35 && p > best.priority)
      ) {
        best = { faq: f, score: s, priority: p };
      }
    }
    return best && best.score >= 2.5 ? best : null;
  }

  function bestGlossary(query, kb) {
    let best = null;
    for (const g of kb.glossary || []) {
      for (const v of anchorVariants(g.term)) {
        if (v.length >= 2 && query.includes(v)) {
          if (!best || v.length > best.len) best = { item: g, len: v.length };
        }
      }
    }
    return best ? best.item : null;
  }

  function commonPrefixLength(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
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
      .map((x) => clip(x.text, 120));
  }

  function primarySentence(unit) {
    const prose = (unit.paragraphs || []).filter((p) => !/^(?:[-*|>#]|\d+[.、])/.test(p));
    const usable = prose.filter((p) => !(/[：:]$/.test(p) && p.length < 40));
    return (
      usable[0] || (unit.bullets || [])[0] || prose[0] || (unit.paragraphs || [])[0] || ''
    );
  }

  function sourceOf(unit) {
    return `${unit.chapterTitle}·${unit.section}`;
  }

  function relatedOf(hits) {
    return hits.slice(1, 3).map((h) => ({
      title: h.unit.section,
      source: sourceOf(h.unit),
      original: h.unit.text,
    }));
  }

  function answer(query, kb, index) {
    const q = normalize(query);
    if (!q) return { type: 'empty', query };

    const faqHit = bestFaq(q, kb);
    if (faqHit) {
      const f = faqHit.faq;
      const hits = search(q, kb, index, 4);
      return {
        type: 'faq',
        query,
        title: f.q,
        conclusion: clip(f.conclusion, 220),
        points: (f.points || []).map((p) => clip(p, 130)).slice(0, 3),
        source: f.source,
        original: `${f.q}\n\n${f.conclusion}${(f.points || []).length ? '\n\n' + f.points.join('\n') : ''}`,
        related: relatedOf(hits),
      };
    }

    const term = bestGlossary(q, kb);
    const hits = search(q, kb, index, 4);

    if (term) {
      return {
        type: 'term',
        query,
        title: `术语：${term.term}`,
        conclusion: clip(term.def, 200),
        points: rankBullets(hits.map((h) => h.unit), new Set(tokenize(q)), 2),
        source: term.label || term.refs || '术语表',
        original: `${term.term}——${term.def}`,
        related: relatedOf(hits),
      };
    }

    const qTokens = new Set(tokenize(q));
    const topHit = hits[0];
    const coverage = topHit && qTokens.size ? topHit.matched / qTokens.size : 0;
    const strongEnough =
      topHit &&
      (topHit.termHit || topHit.matched >= 2 || coverage >= 0.6 || topHit.score >= 4);

    if (!hits.length || topHit.score < 1.15 || !strongEnough) {
      return {
        type: 'none',
        query,
        conclusion:
          '本知识库暂未覆盖这个问题。可以换用论中的术语提问（如“无遮非遮”“净见量”“现基”“善证无执”），或查阅各章原文。',
        points: [],
        source: '',
        original: '',
        related: [],
      };
    }

    const unit = topHit.unit;
    const rankedOwnBullets = (unit.bullets || [])
      .map((b) => ({ text: b, score: overlapCount(tokenize(b), qTokens) }))
      .sort((a, b) => b.score - a.score);
    const conclusion =
      rankedOwnBullets.length && rankedOwnBullets[0].score >= 2
        ? clip(rankedOwnBullets[0].text, 190)
        : clip(primarySentence(unit), 190);
    const points = rankBullets(
      hits.slice(0, 2).map((h) => h.unit),
      qTokens,
      4
    )
      .filter((p) => {
        const a = p.replace(/[。；\s]/g, '');
        const b = conclusion.replace(/[。；\s]/g, '');
        return a !== b && commonPrefixLength(a, b) < 5;
      })
      .slice(0, 3);

    return {
      type: 'unit',
      query,
      title: `${unit.chapterTitle}·${unit.section}`,
      conclusion,
      points,
      source: sourceOf(unit),
      original: unit.text,
      related: relatedOf(hits),
    };
  }

  return {
    tokenize,
    normalize,
    buildIndex,
    search,
    answer,
    clip,
    scoreFaq,
  };
});
