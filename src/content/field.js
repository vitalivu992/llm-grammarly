// Reading text out of editable fields and writing edits back in. Classic script:
// sets globalThis.PWField.
(() => {
  const TEXT_INPUTS = new Set(['text', 'search', '']);
  const BLOCK = /^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIGCAPTION|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL)$/;
  const CODE_EDITORS = '.monaco-editor, .CodeMirror, .cm-editor, .ace_editor';

  // Find the editable element we should attach to for an event target, or null.
  function resolve(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.closest?.('[data-gramm="false"], [data-penwright="off"]')) return null;
    if (el.closest?.(CODE_EDITORS)) return null;
    if (el.tagName === 'TEXTAREA') return el.readOnly || el.disabled ? null : el;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (!TEXT_INPUTS.has(type) || el.readOnly || el.disabled) return null;
      return el;
    }
    if (el.isContentEditable) {
      // Use the outermost editable ancestor as the field.
      let root = el;
      while (root.parentElement?.isContentEditable) root = root.parentElement;
      if (root.getAttribute('spellcheck') === 'false') return null;
      return root;
    }
    return null;
  }

  const isPlain = (el) => el.tagName === 'TEXTAREA' || el.tagName === 'INPUT';

  // Build the text of a contenteditable plus a map from text offsets back to
  // DOM text nodes. Block boundaries and <br> become "\n" (unmapped).
  function snapshot(el) {
    if (isPlain(el)) return { text: el.value, segs: null };
    let text = '';
    const segs = [];
    const walk = (node) => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const v = c.nodeValue;
          if (!v) continue;
          segs.push({ node: c, start: text.length, end: text.length + v.length });
          text += v.replace(/\u00a0/g, ' ');
        } else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === 'BR') {
            text += '\n';
            continue;
          }
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue;
          const block = BLOCK.test(tag);
          if (block && text && !text.endsWith('\n')) text += '\n';
          walk(c);
          if (block && text && !text.endsWith('\n')) text += '\n';
        }
      }
    };
    walk(el);
    // A trailing newline from the last block is layout, not content.
    if (text.endsWith('\n') && !(segs.length && segs.at(-1).end === text.length)) text = text.slice(0, -1);
    return { text, segs };
  }

  function getText(el) {
    return snapshot(el).text;
  }

  // Map a text offset to a DOM point. `side` decides which text node wins when
  // the offset sits on a boundary between two nodes.
  function point(segs, off, side) {
    if (!segs.length) return null;
    for (const s of segs) {
      if (side === 'start' ? off >= s.start && off < s.end : off > s.start && off <= s.end) {
        return { node: s.node, offset: off - s.start };
      }
    }
    // Offset falls on a synthesized newline: snap to the nearest text node.
    if (side === 'start') {
      const next = segs.find((s) => s.start >= off);
      return next ? { node: next.node, offset: 0 } : { node: segs.at(-1).node, offset: segs.at(-1).node.length };
    }
    const prev = [...segs].reverse().find((s) => s.end <= off);
    return prev ? { node: prev.node, offset: prev.node.length } : { node: segs[0].node, offset: 0 };
  }

  function insert(el, text) {
    // execCommand keeps the page's undo stack and fires the input events that
    // frameworks (React, Lexical, ProseMirror, Gmail...) listen to.
    if (document.execCommand('insertText', false, text)) return true;
    if (!isPlain(el)) {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }
    return false;
  }

  function selectRange(el, start, end, segs) {
    if (isPlain(el)) {
      el.setSelectionRange(start, end);
      return true;
    }
    const a = point(segs, start, 'start');
    const b = start === end ? a : point(segs, end, 'end');
    if (!a || !b) return false;
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  function setPlainValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const norm = (s) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

  // Apply hunks (from PWDiff.diff, offsets into the current field text).
  // Edits go in back to front so earlier offsets stay valid. Returns true when
  // the field ends up holding `expected`.
  function applyHunks(el, hunks, expected) {
    el.focus();
    for (let i = hunks.length - 1; i >= 0; i--) {
      const h = hunks[i];
      const { segs } = snapshot(el);
      if (!selectRange(el, h.start, h.end, segs)) break;
      if (h.ins) insert(el, h.ins);
      else document.execCommand('delete');
    }
    if (norm(getText(el)) === norm(expected)) return true;

    // The editor fought back; replace everything in one go instead.
    if (isPlain(el)) {
      setPlainValue(el, expected);
    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      insert(el, expected);
    }
    return norm(getText(el)) === norm(expected);
  }

  globalThis.PWField = { resolve, getText, applyHunks, snapshot };
})();
