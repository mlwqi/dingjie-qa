(function () {
  'use strict';

  const KB = window.KB;
  const SC = window.SearchCore;
  if (!KB || !SC) return;

  const index = SC.buildIndex(KB);
  const $ = (sel) => document.querySelector(sel);
  const answerEl = $('#answer');
  const input = $('#q');
  const form = $('#ask-form');
  const dialog = $('#source-dialog');
  const dialogTitle = $('#dialog-title');
  const dialogBody = $('#dialog-body');

  let current = null;

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });

  const CHIPS = [
    '无遮还是非遮',
    '二谛何者为主要',
    '观察修还是安住修',
    '六道共同所见是什么',
    '入定有没有执着',
    '什么是净见量',
    '自解脱是什么意思',
    '五蕴如何对应五方佛',
    '本尊即是了义法身',
  ];

  /* ---------- theme ---------- */

  const themeButtons = [...document.querySelectorAll('[data-theme-set]')];

  function setTheme(name) {
    if (typeof window.__applyTheme === 'function') {
      window.__applyTheme(name);
    } else {
      document.documentElement.dataset.theme = name;
      try {
        localStorage.setItem('dj-theme', name);
      } catch (e) {
        /* ignore */
      }
    }
    themeButtons.forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === name))
    );
  }

  setTheme(document.documentElement.dataset.theme || 'paper');

  /* ---------- chips & seven cards ---------- */

  function makeChip(text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = text;
    b.addEventListener('click', () => ask(text));
    return b;
  }

  const chipsEl = $('#chips');
  CHIPS.forEach((t) => chipsEl.appendChild(makeChip(t)));

  const sevenGrid = $('#seven-grid');
  (KB.sevenQuestions || []).forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-card';
    b.innerHTML = `<span class="n">${q.n}</span><span class="t">${esc(
      q.question
    )}<small>自宗：${esc(q.answer)}</small></span>`;
    b.addEventListener('click', () => ask(q.question));
    sevenGrid.appendChild(b);
  });

  function renderVerseBrowser() {
    const host = $('#verse-browser');
    if (!host || !KB.verses || !KB.verses.length) return;
    const groups = new Map();
    for (const v of KB.verses) {
      if (!groups.has(v.chapterId)) {
        groups.set(v.chapterId, { title: v.chapterTitle || v.chapterId, items: [] });
      }
      groups.get(v.chapterId).items.push(v);
    }
    groups.forEach((g) => {
      const details = document.createElement('details');
      details.className = 'verse-group';
      const summary = document.createElement('summary');
      summary.textContent = `${g.title}（${g.items.length}）`;
      details.appendChild(summary);
      const list = document.createElement('div');
      list.className = 'verse-list';
      g.items.forEach((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'verse-item';
        b.textContent = v.text.split('\n')[0];
        b.title = v.text.replace(/\n/g, ' / ');
        b.addEventListener('click', () => ask(v.text.split('\n')[0]));
        list.appendChild(b);
      });
      details.appendChild(list);
      host.appendChild(details);
    });
  }

  renderVerseBrowser();

  /* ---------- search ---------- */

  function ask(text) {
    input.value = text;
    run(text, true);
  }

  function run(query, scroll) {
    const q = String(query || '').trim();
    if (!q) {
      input.focus();
      return;
    }
    const a = SC.answer(q, KB, index);
    current = a;
    render(a);

    try {
      history.replaceState(null, '', '#q=' + encodeURIComponent(q));
    } catch (e) {
      /* ignore */
    }
    document.title = q.slice(0, 22) + ' · 《定解宝灯论》问答';

    if (scroll) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      answerEl.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function render(a) {
    if (!a || a.type === 'empty') {
      answerEl.innerHTML = '';
      return;
    }

    const parts = [];
    parts.push('<div class="answer-card">');

    if (a.title) {
      parts.push(`<p class="answer-title">${esc(a.title)}</p>`);
    }

    if (a.verse) {
      parts.push(
        `<blockquote class="verse">${esc(a.verse).replace(/\n/g, '<br>')}</blockquote>`
      );
    }

    parts.push(`<p class="conclusion">${esc(a.conclusion)}</p>`);

    if (a.points && a.points.length) {
      parts.push(
        '<ul class="points">' +
          a.points.map((p) => `<li>${esc(p)}</li>`).join('') +
          '</ul>'
      );
    }

    if (a.sections && a.sections.length) {
      parts.push(
        `<details class="deep"><summary>展开详解（${a.sections.length} 段）</summary>`
      );
      a.sections.forEach((s) => {
        parts.push('<div class="deep-sec">');
        if (s.heading) parts.push(`<h4>${esc(s.heading)}</h4>`);
        parts.push(`<p>${esc(s.text)}</p>`);
        if (s.source) parts.push(`<small>${esc(s.source)}</small>`);
        parts.push('</div>');
      });
      parts.push('</details>');
    }

    if (a.type === 'clarify' && a.candidates && a.candidates.length) {
      parts.push('<div class="candidates">');
      a.candidates.forEach((c, i) => {
        parts.push(
          `<button type="button" class="candidate" data-candidate="${i}"><span>${esc(
            c.title
          )}</span><small>${esc(c.source)}</small></button>`
        );
      });
      parts.push('</div>');
    }

    if (a.type === 'none') {
      parts.push('<div class="none-tip">可以试试：</div>');
    }

    if (a.source || a.original) {
      parts.push('<div class="source-row">');
      parts.push(`<span class="source">出处 · ${esc(a.source || '知识库')}</span>`);
      parts.push('<span class="actions">');
      if (a.original) {
        parts.push('<button type="button" class="link-btn" data-act="original">查看原文</button>');
      }
      parts.push('<button type="button" class="link-btn" data-act="copy">复制链接</button>');
      parts.push('</span>');
      parts.push('</div>');
    }

    if (a.related && a.related.length) {
      parts.push('<details class="related"><summary>相关章节</summary>');
      a.related.forEach((r, i) => {
        parts.push(
          `<button type="button" class="related-item" data-related="${i}"><span>${esc(
            r.source
          )}</span><small>${esc(r.title)}</small></button>`
        );
      });
      parts.push('</details>');
    }

    parts.push('</div>');
    answerEl.innerHTML = parts.join('');

    if (a.type === 'none') {
      const tip = answerEl.querySelector('.none-tip');
      ['无遮非遮', '净见量', '现基', '善证无执'].forEach((t) => tip.appendChild(makeChip(t)));
    }

    answerEl.classList.remove('fade');
    void answerEl.offsetWidth;
    answerEl.classList.add('fade');

    const origBtn = answerEl.querySelector('[data-act="original"]');
    if (origBtn) {
      origBtn.addEventListener('click', () => {
        openDialog(a.title || a.source || '原文', a.original);
      });
    }

    const copyBtn = answerEl.querySelector('[data-act="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          copyBtn.textContent = '已复制';
          setTimeout(() => (copyBtn.textContent = '复制链接'), 1600);
        } catch (e) {
          copyBtn.textContent = '复制失败';
        }
      });
    }

    answerEl.querySelectorAll('[data-candidate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = a.candidates[Number(btn.dataset.candidate)];
        if (!c) return;
        if (c.action === 'ask' && c.query) {
          input.value = c.query;
          run(c.query, true);
        } else {
          openDialog(c.title, c.original);
        }
      });
    });

    answerEl.querySelectorAll('[data-related]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const r = a.related[Number(btn.dataset.related)];
        if (r) openDialog(r.source + ' · ' + r.title, r.original);
      });
    });
  }

  /* ---------- dialog ---------- */

  function openDialog(title, text) {
    dialogTitle.textContent = title || '原文';
    dialogBody.textContent = text || '';
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  $('#dialog-close').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  /* ---------- events ---------- */

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value, true);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
      e.preventDefault();
      input.focus();
    }
  });

  window.addEventListener('hashchange', () => {
    const m = window.location.hash.match(/^#q=(.+)$/);
    if (m) {
      const q = decodeURIComponent(m[1]);
      if (q && q !== input.value) {
        input.value = q;
        run(q, true);
      }
    }
  });

  /* ---------- initial ---------- */

  const initial = window.location.hash.match(/^#q=(.+)$/);
  if (initial) {
    const q = decodeURIComponent(initial[1]);
    input.value = q;
    run(q, false);
  }
})();
