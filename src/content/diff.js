// Word-level diff between the original and revised text. Classic script: it sets
// globalThis.PWDiff so content scripts (and Node tests) can share it.
(() => {
  const TOKEN = /\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}_]/gu;
  const MAX_CELLS = 4_000_000;

  function tokenize(s) {
    return s.match(TOKEN) || [];
  }

  // Returns hunks: [{ start, end, del, ins }] with offsets into `a`.
  function diff(a, b) {
    if (a === b) return [];
    const A = tokenize(a);
    const B = tokenize(b);
    let pre = 0;
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    let suf = 0;
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    const a2 = A.slice(pre, A.length - suf);
    const b2 = B.slice(pre, B.length - suf);

    // ops over the middle: ['=', tok] | ['-', tok] | ['+', tok]
    let ops;
    const n = a2.length;
    const m = b2.length;
    if (n * m > MAX_CELLS) {
      ops = [...a2.map((t) => ['-', t]), ...b2.map((t) => ['+', t])];
    } else {
      const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      ops = [];
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (a2[i] === b2[j]) ops.push(['=', a2[i++]]), j++;
        else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', a2[i++]]);
        else ops.push(['+', b2[j++]]);
      }
      while (i < n) ops.push(['-', a2[i++]]);
      while (j < m) ops.push(['+', b2[j++]]);
    }

    // Group runs of changes into hunks. Hunks stay per word (not merged across
    // unchanged spaces) so each can be accepted on its own and edits in rich
    // editors don't span formatting boundaries.
    const hunks = [];
    let pos = A.slice(0, pre).join('').length;
    let cur = null;
    for (const [op, tok] of ops) {
      if (op === '=') {
        if (cur) hunks.push(cur);
        cur = null;
        pos += tok.length;
        continue;
      }
      if (!cur) cur = { start: pos, end: pos, del: '', ins: '' };
      if (op === '-') {
        cur.del += tok;
        cur.end += tok.length;
        pos += tok.length;
      } else {
        cur.ins += tok;
      }
    }
    if (cur) hunks.push(cur);
    return hunks.map(trimHunk).filter((h) => h.del !== h.ins);
  }

  // Drop whitespace shared at both ends of a hunk so highlights hug the words.
  function trimHunk(h) {
    let { start, end, del, ins } = h;
    while (del && ins && del[0] === ins[0] && /\s/.test(del[0])) {
      del = del.slice(1);
      ins = ins.slice(1);
      start++;
    }
    while (del && ins && del.at(-1) === ins.at(-1) && /\s/.test(del.at(-1))) {
      del = del.slice(0, -1);
      ins = ins.slice(0, -1);
      end--;
    }
    return { start, end, del, ins };
  }

  // Rebuild text applying only the accepted hunks.
  function apply(original, hunks, accepted = hunks.map(() => true)) {
    let out = '';
    let pos = 0;
    hunks.forEach((h, i) => {
      out += original.slice(pos, h.start) + (accepted[i] ? h.ins : h.del);
      pos = h.end;
    });
    return out + original.slice(pos);
  }

  globalThis.PWDiff = { diff, apply, tokenize };
})();
