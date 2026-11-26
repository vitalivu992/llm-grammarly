// Content script: badge on the focused field, panel with corrections and rewrites.
(() => {
  if (globalThis.__penwright) return;
  globalThis.__penwright = true;

  const { diff, apply } = globalThis.PWDiff;
  const { resolve, getText, applyHunks } = globalThis.PWField;
  const { TONES, FORMALITY, DEFAULTS, MAX_CHARS } = globalThis.PWShared;

  const ICON = {
    pen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 13l1-4 6.5-6.5 3 3L7 12l-4 1z"/><path d="M9 4l3 3"/></svg>',
    ring: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2a6 6 0 1 1-6 6" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8.5l3 3 7-7"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    gear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
  };

  let settings = { ...DEFAULTS };
  let field = null; // the editable element we are attached to
  let panelOpen = false;
  let tab = 'check';
  let cleanView = false;
  let timer = 0;
  const states = new WeakMap();
  const cache = new Map();

  const site = location.hostname || hostFromAncestors();
  function hostFromAncestors() {
    try {
      const o = location.ancestorOrigins;
      return o?.length ? new URL(o[o.length - 1]).hostname : '';
    } catch {
      return '';
    }
  }
  const disabled = () => settings.disabledSites.includes(site);

  // ---------- DOM ----------
  const host = document.createElement('penwright-root');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(globalThis.PWStyles);
  shadow.adoptedStyleSheets = [sheet];
  const root = document.createElement('div');
  root.className = 'pw';
  const badge = document.createElement('button');
  badge.className = 'badge';
  badge.type = 'button';
  badge.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Penwright writing suggestions');
  root.append(badge, panel);
  shadow.append(root);

  function mount() {
    if (!host.isConnected) (document.body || document.documentElement).append(host);
  }

  // Keep focus (and the caret/selection) in the page's field while using our UI.
  for (const el of [badge, panel]) {
    el.addEventListener('mousedown', (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
  }

  // ---------- state ----------
  function stateOf(el) {
    let st = states.get(el);
    if (!st) {
      st = { status: 'idle', text: '', hunks: [], accepted: [], notes: [], model: '', error: '', rewrite: null };
      states.set(el, st);
    }
    return st;
  }

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (e) {
      return { error: /context invalidated/i.test(e.message) ? 'Penwright was updated. Reload this page.' : e.message };
    }
  }

  function remember(key, value) {
    cache.set(key, value);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
  }

  // Pair each diff hunk with the model's explanation when one matches.
  function notesFor(hunks, edits) {
    const norm = (s) => s.trim().toLowerCase();
    return hunks.map((h) => {
      const del = norm(h.del);
      const ins = norm(h.ins);
      const e =
        edits.find((x) => norm(x.from) === del && norm(x.to) === ins) ||
        edits.find((x) => (del && norm(x.from).includes(del)) || (ins && norm(x.to).includes(ins))) ||
        edits.find((x) => (norm(x.from) && del.includes(norm(x.from))) || (norm(x.to) && ins.includes(norm(x.to))));
      return { type: e?.type || (h.del && h.ins ? 'edit' : h.ins ? 'insert' : 'remove'), why: e?.why || '' };
    });
  }

  function fill(target, text, res) {
    target.text = text;
    target.hunks = diff(text, res.text);
    target.accepted = target.hunks.map(() => true);
    target.notes = notesFor(target.hunks, res.edits || []);
    target.model = res.model || '';
    target.error = '';
  }

  // ---------- checking ----------
  function schedule() {
    clearTimeout(timer);
    if (!field || !settings.autoCheck || disabled()) return;
    timer = setTimeout(() => check(false), settings.delayMs);
  }

  async function check(force) {
    const el = field;
    if (!el) return;
    const st = stateOf(el);
    const text = getText(el);
    if (!text.trim() || (!force && text.trim().length < settings.minChars)) {
      st.status = 'idle';
      st.text = text;
      return render();
    }
    if (text.length > MAX_CHARS) {
      Object.assign(st, { status: 'error', text, error: `Text is longer than ${MAX_CHARS} characters. Select a shorter field.` });
      return render();
    }
    const key = `check|${text}`;
    if (cache.has(key)) {
      fill(st, text, cache.get(key));
      st.status = st.hunks.length ? 'issues' : 'clean';
      return render();
    }
    st.status = 'checking';
    st.text = text;
    render();
    const res = await send({ type: 'analyze', mode: 'check', text, channel: 'check' });
    if (res?.aborted || st.text !== text) return;
    if (res?.ok) remember(key, res);
    // The user kept typing; a newer check is already scheduled.
    if (getText(el) !== text) return;
    if (!res || res.error) {
      Object.assign(st, { status: 'error', error: res?.error || 'No response', needsSetup: !!res?.needsSetup });
      return render();
    }
    fill(st, text, res);
    st.needsSetup = false;
    st.status = st.hunks.length ? 'issues' : 'clean';
    render();
  }

  async function rewrite() {
    const el = field;
    if (!el) return;
    const st = stateOf(el);
    const text = getText(el);
    if (!text.trim()) return;
    const rw = (st.rewrite = { status: 'checking', text, hunks: [], accepted: [], notes: [], model: '', error: '' });
    render();
    const opts = { tone: settings.tone, formality: settings.formality };
    const key = `rewrite|${opts.tone}|${opts.formality}|${text}`;
    const res = cache.get(key) || (await send({ type: 'analyze', mode: 'rewrite', text, channel: 'rewrite', ...opts }));
    if (res?.aborted || st.rewrite !== rw) return;
    if (!res || res.error) {
      Object.assign(rw, { status: 'error', error: res?.error || 'No response' });
      return render();
    }
    remember(key, res);
    fill(rw, text, res);
    rw.status = 'done';
    render();
  }

  function resultFor(kind) {
    const st = stateOf(field);
    return kind === 'rewrite' ? st.rewrite : st;
  }

  function applyResult(kind) {
    const r = resultFor(kind);
    if (!r || !r.hunks.length) return;
    if (getText(field) !== r.text) {
      // The user kept typing after the check; the offsets no longer line up.
      if (kind === 'check') check(true);
      else Object.assign(r, { status: 'error', error: 'The text changed since this rewrite. Rewrite again.' });
      return render();
    }
    const expected = apply(r.text, r.hunks, r.accepted);
    const chosen = r.hunks.filter((_, i) => r.accepted[i]);
    const ok = applyHunks(field, chosen, expected);
    const st = stateOf(field);
    if (!ok) {
      navigator.clipboard?.writeText(expected).catch(() => {});
      Object.assign(r, { status: 'error', error: 'This editor did not accept the change. The text was copied to your clipboard; paste it in.' });
      return render();
    }
    // What the user kept is final: don't flag it again.
    remember(`check|${getText(field)}`, { text: getText(field), edits: [], model: r.model });
    fill(st, getText(field), { text: getText(field), edits: [], model: r.model });
    st.status = 'clean';
    st.rewrite = null;
    closePanel();
  }

  function copyResult(kind, btn) {
    const r = resultFor(kind);
    if (!r) return;
    navigator.clipboard.writeText(apply(r.text, r.hunks, r.accepted)).then(
      () => {
        btn.textContent = 'Copied';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      },
      () => (btn.textContent = 'Copy failed'),
    );
  }

  async function saveSetting(patch) {
    Object.assign(settings, patch);
    const { settings: stored = {} } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...stored, ...patch } });
  }

  // ---------- rendering ----------
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function diffHtml(r) {
    let out = '';
    let pos = 0;
    r.hunks.forEach((h, i) => {
      out += esc(r.text.slice(pos, h.start));
      if (r.accepted[i]) {
        out += `<span class="hunk" data-hunk="${i}" title="Click to keep the original">${h.del ? `<del>${esc(h.del)}</del>` : ''}${h.ins ? `<ins>${esc(h.ins)}</ins>` : ''}</span>`;
      } else {
        out += `<span class="hunk off" data-hunk="${i}" title="Click to accept: ${esc(h.ins || '(remove)')}">${esc(h.del || '‸')}</span>`;
      }
      pos = h.end;
    });
    return out + esc(r.text.slice(pos));
  }

  function editsHtml(r) {
    return r.hunks
      .map((h, i) => {
        const n = r.notes[i];
        const change = `${h.del ? `<s>${esc(h.del.trim())}</s>` : ''}${h.del && h.ins ? ' → ' : ''}${h.ins ? `<b>${esc(h.ins.trim())}</b>` : ''}`;
        return `<li class="edit${r.accepted[i] ? '' : ' off'}" data-hunk="${i}">
          <span class="type">${esc(n.type)}</span><span class="change">${change || '(whitespace)'}</span>
          <span class="state">${r.accepted[i] ? 'Accepted' : 'Skipped'}</span>
          ${n.why ? `<span class="why">${esc(n.why)}</span>` : ''}</li>`;
      })
      .join('');
  }

  function resultHtml(r, label) {
    const n = r.accepted.filter(Boolean).length;
    return `<div class="label"><span>${label}</span><button class="link" data-action="view">${cleanView ? 'Show changes' : 'Show clean'}</button></div>
      <div class="text${cleanView ? ' clean' : ''}" data-kind="text">${diffHtml(r)}</div>
      <div class="label" style="margin-top:12px"><span>${r.hunks.length} change${r.hunks.length === 1 ? '' : 's'} · ${n} accepted</span></div>
      <ul class="edits">${editsHtml(r)}</ul>`;
  }

  function errorHtml(r) {
    return `<div class="error">${esc(r.error)}</div>${
      r.needsSetup ? '<p style="margin-top:10px"><button class="btn primary" data-action="options">Open options</button></p>' : ''
    }`;
  }

  function checkBody(st) {
    if (st.status === 'checking') return '<div class="empty"><div class="spinner"></div>Checking your text…</div>';
    if (st.status === 'error') return errorHtml(st);
    if (st.status === 'clean')
      return `<div class="empty"><span class="mark">✓</span><strong>Looks good</strong>No corrections suggested.</div>`;
    if (st.status === 'issues') return resultHtml(st, 'Suggested text');
    return `<div class="empty"><strong>Nothing checked yet</strong>${
      settings.autoCheck ? `Penwright checks after you pause typing (${settings.minChars}+ characters).` : 'Auto-check is off.'
    }<p style="margin-top:12px"><button class="btn primary" data-action="check">Check now</button></p></div>`;
  }

  function rewriteBody(st) {
    const level = Number(settings.formality) || 3;
    const rw = st.rewrite;
    let out = `<div class="label"><span>Tone</span></div>
      <div class="chips">${TONES.map(
        (t) => `<button class="chip" data-tone="${t.id}" aria-pressed="${settings.tone === t.id}">${t.label}</button>`,
      ).join('')}</div>
      <div class="label"><span>Formality</span></div>
      <div class="slider"><span>Casual</span><input type="range" min="1" max="5" step="1" value="${level}" data-action="formality" aria-label="Formality"><span>Formal</span></div>
      <div class="level">${FORMALITY[level - 1]}</div>
      <button class="btn primary" data-action="rewrite" style="width:100%">${rw ? 'Rewrite again' : 'Rewrite'}</button>`;
    if (rw?.status === 'checking') out += '<div class="empty"><div class="spinner"></div>Rewriting…</div>';
    else if (rw?.status === 'error') out += errorHtml(rw);
    else if (rw?.status === 'done')
      out += rw.hunks.length
        ? `<div style="margin-top:14px">${resultHtml(rw, 'Rewritten text')}</div>`
        : '<div class="empty">The text already fits this tone.</div>';
    return out;
  }

  function render() {
    renderBadge();
    if (panelOpen) renderPanel();
  }

  function renderBadge() {
    if (!field || disabled()) {
      badge.hidden = true;
      return;
    }
    const st = stateOf(field);
    badge.dataset.state = st.status;
    const n = st.hunks.filter((_, i) => st.accepted[i]).length;
    badge.innerHTML =
      st.status === 'checking' ? ICON.ring : st.status === 'issues' ? String(Math.min(n || st.hunks.length, 99)) : st.status === 'clean' ? ICON.check : st.status === 'error' ? '!' : ICON.pen;
    badge.title =
      st.status === 'issues' ? `${st.hunks.length} suggestion(s), click to review` : st.status === 'error' ? st.error : st.status === 'clean' ? 'No issues found' : 'Penwright: check or rewrite';
    badge.setAttribute('aria-label', badge.title);
    badge.hidden = false;
    position();
  }

  function renderPanel() {
    const st = stateOf(field);
    const r = tab === 'check' ? st : st.rewrite;
    const model = r?.model || '';
    const scroll = panel.querySelector('.body')?.scrollTop || 0;
    const canApply = r && r.hunks.length && (tab === 'check' ? st.status === 'issues' : r.status === 'done');
    const n = canApply ? r.accepted.filter(Boolean).length : 0;
    panel.innerHTML = `
      <div class="head">
        <div class="brand">Penwright<small>Writing assistant</small></div>
        <div class="model" title="${esc(model)}">${esc(model)}</div>
        <button class="icon-btn" data-action="options" title="Options">${ICON.gear}</button>
        <button class="icon-btn" data-action="close" title="Close (Esc)">${ICON.close}</button>
      </div>
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="check" aria-selected="${tab === 'check'}">Corrections${
          st.status === 'issues' ? `<span class="count">${st.hunks.length}</span>` : ''
        }</button>
        <button class="tab" role="tab" data-tab="rewrite" aria-selected="${tab === 'rewrite'}">Tone &amp; rewrite</button>
      </div>
      <div class="body">${tab === 'check' ? checkBody(st) : rewriteBody(st)}</div>
      ${
        canApply
          ? `<div class="foot">
        <button class="btn primary" data-action="apply" ${n ? '' : 'disabled'}>Apply ${n} change${n === 1 ? '' : 's'}</button>
        <button class="btn" data-action="copy">Copy</button>
        <span class="spacer"></span>
        ${tab === 'check' ? '<button class="link" data-action="check">Recheck</button>' : ''}
      </div>`
          : ''
      }`;
    panel.querySelector('.body').scrollTop = scroll;
    panel.hidden = false;
    position();
  }

  panel.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action], [data-tab], [data-tone], [data-hunk]');
    if (!t) return;
    const kind = tab;
    if (t.dataset.tab) {
      tab = t.dataset.tab;
      return renderPanel();
    }
    if (t.dataset.tone) {
      saveSetting({ tone: t.dataset.tone });
      return renderPanel();
    }
    if (t.dataset.hunk !== undefined) {
      const r = resultFor(kind);
      const i = Number(t.dataset.hunk);
      r.accepted[i] = !r.accepted[i];
      return render();
    }
    switch (t.dataset.action) {
      case 'close':
        return closePanel();
      case 'options':
        return send({ type: 'openOptions' });
      case 'check':
        cache.delete(`check|${getText(field)}`);
        return check(true);
      case 'rewrite':
        return rewrite();
      case 'apply':
        return applyResult(kind);
      case 'copy':
        return copyResult(kind, t);
      case 'view':
        cleanView = !cleanView;
        return renderPanel();
    }
  });

  panel.addEventListener('input', (e) => {
    if (e.target.dataset.action !== 'formality') return;
    const v = Number(e.target.value);
    panel.querySelector('.level').textContent = FORMALITY[v - 1];
    saveSetting({ formality: v });
  });

  badge.addEventListener('click', () => {
    if (panelOpen) return closePanel();
    openPanel();
  });

  function openPanel() {
    if (!field) return;
    panelOpen = true;
    const st = stateOf(field);
    if (st.status === 'idle' || (st.status !== 'checking' && st.text !== getText(field))) check(true);
    renderPanel();
  }

  function closePanel() {
    panelOpen = false;
    panel.hidden = true;
    renderBadge();
  }

  // ---------- positioning ----------
  function position() {
    if (!field || badge.hidden) return;
    if (!field.isConnected) return detach();
    const r = field.getBoundingClientRect();
    const vw = innerWidth;
    const vh = innerHeight;
    if (r.width === 0 || r.bottom < 0 || r.top > vh) {
      badge.style.visibility = 'hidden';
      return;
    }
    badge.style.visibility = '';
    const size = 22;
    const inset = Math.max(2, Math.min(6, (r.height - size) / 2));
    const bx = Math.min(r.right, vw) - size - inset;
    const by = Math.min(r.bottom, vh) - size - inset;
    badge.style.left = `${Math.max(4, bx)}px`;
    badge.style.top = `${Math.max(4, by)}px`;
    if (!panelOpen) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const clampTop = (t) => Math.max(8, Math.min(t, vh - h - 8));
    let left;
    let top;
    // Prefer beside the field so the text stays readable, then below/above the badge.
    if (r.right + 12 + w <= vw - 8) {
      left = r.right + 12;
      top = clampTop(r.top);
    } else if (r.left - 12 - w >= 8) {
      left = r.left - 12 - w;
      top = clampTop(r.top);
    } else {
      left = Math.min(Math.max(8, bx + size - w), vw - w - 8);
      top = by + size + 8;
      if (top + h > vh - 8) top = by - h - 8;
      top = clampTop(top);
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  let raf = 0;
  const reposition = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), position()));
  };
  setInterval(() => field && reposition(), 400);

  // ---------- field tracking ----------
  function attach(el) {
    if (field === el) return;
    field = el;
    tab = 'check';
    mount();
    const st = stateOf(el);
    if (settings.autoCheck && st.text !== getText(el)) schedule();
    render();
  }

  function detach() {
    clearTimeout(timer);
    field = null;
    closePanel();
    badge.hidden = true;
  }

  document.addEventListener(
    'focusin',
    (e) => {
      if (disabled()) return;
      const el = resolve(e.composedPath()[0]);
      if (el) attach(el);
    },
    true,
  );

  document.addEventListener(
    'focusout',
    () => {
      setTimeout(() => {
        if (!field || panelOpen) return;
        const a = document.activeElement;
        if (a === host || (a && (a === field || field.contains(a)))) return;
        badge.hidden = true;
      }, 150);
    },
    true,
  );

  document.addEventListener(
    'input',
    (e) => {
      if (!field) return;
      const el = resolve(e.composedPath()[0]);
      if (el !== field) return;
      const st = stateOf(field);
      if (st.status !== 'checking' && st.text !== getText(field)) {
        st.status = 'idle';
        if (panelOpen && tab === 'check') renderPanel();
        else renderBadge();
      }
      schedule();
    },
    true,
  );

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!panelOpen) return;
      const path = e.composedPath();
      if (path.includes(host) || path.includes(field)) return;
      closePanel();
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (panelOpen && e.key === 'Escape') {
        e.stopPropagation();
        closePanel();
      }
    },
    true,
  );

  addEventListener('scroll', reposition, true);
  addEventListener('resize', reposition);

  // ---------- settings ----------
  chrome.storage.local.get('settings').then(({ settings: s }) => {
    settings = { ...DEFAULTS, ...(s || {}) };
    root.dataset.theme = settings.theme;
    // A field may already be focused when the script loads.
    const el = resolve(document.activeElement);
    if (el && !disabled()) attach(el);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    settings = { ...DEFAULTS, ...(changes.settings.newValue || {}) };
    root.dataset.theme = settings.theme;
    if (disabled()) detach();
    // Only the badge: re-rendering the panel would interrupt a slider drag.
    else renderBadge();
  });
})();
