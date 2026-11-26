import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/content/diff.js';
import { buildMessages, parseResult } from '../src/lib/prompt.js';
import { PROVIDERS, connectionFor, DEFAULTS } from '../src/lib/config.js';

const { diff, apply } = globalThis.PWDiff;

test('diff: identical text has no hunks', () => {
  assert.deepEqual(diff('Hello world.', 'Hello world.'), []);
});

test('diff: word substitutions become separate hunks', () => {
  const a = 'i has went to the store and buyed three apple.';
  const b = 'I went to the store and bought three apples.';
  const h = diff(a, b);
  assert.deepEqual(
    h.map((x) => [x.del, x.ins]),
    [
      ['i has', 'I'],
      ['buyed', 'bought'],
      ['apple', 'apples'],
    ],
  );
  assert.equal(apply(a, h), b);
});

test('diff: offsets point into the original', () => {
  const a = 'Their is a cat.';
  const [h] = diff(a, 'There is a cat.');
  assert.equal(a.slice(h.start, h.end), h.del);
});

test('diff: rejecting a hunk keeps the original fragment', () => {
  const a = 'teh cat sat on teh mat';
  const h = diff(a, 'the cat sat on the mat');
  assert.equal(h.length, 2);
  assert.equal(apply(a, h, [true, false]), 'the cat sat on teh mat');
  assert.equal(apply(a, h, [false, false]), a);
});

test('diff: newlines and punctuation are preserved', () => {
  const a = 'Hi team,\n\nmeeting is thursday.\nThanks';
  const b = 'Hi team,\n\nThe meeting is on Thursday.\nThanks';
  assert.equal(apply(a, diff(a, b)), b);
});

test('diff: unicode words', () => {
  const a = 'Tôi đi họk ở trường.';
  const b = 'Tôi đi học ở trường.';
  const h = diff(a, b);
  assert.deepEqual(h.map((x) => [x.del, x.ins]), [['họk', 'học']]);
});

test('diff: huge inputs fall back to one hunk', () => {
  const a = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
  const b = Array.from({ length: 3000 }, (_, i) => `x${i}`).join(' ');
  assert.equal(apply(a, diff(a, b)), b);
});

test('parseResult: plain JSON', () => {
  const r = parseResult('{"text":"Fixed.","edits":[{"from":"fixd","to":"Fixed","type":"Spelling","why":"typo"}]}', 'fixd.');
  assert.equal(r.text, 'Fixed.');
  assert.deepEqual(r.edits, [{ from: 'fixd', to: 'Fixed', type: 'spelling', why: 'typo' }]);
});

test('parseResult: fenced JSON with prose and think block', () => {
  const raw = '<think>hmm {"x":1}</think>Sure! Here you go:\n```json\n{"text": "A \\"quoted\\" {brace}", "edits": []}\n```';
  assert.equal(parseResult(raw, 'a').text, 'A "quoted" {brace}');
});

test('parseResult: JSON embedded in prose without fences', () => {
  assert.equal(parseResult('Result: {"text":"ok"} done', 'ok').text, 'ok');
});

test('parseResult: keeps original surrounding whitespace and strips echoed tags', () => {
  assert.equal(parseResult('{"text":"<text>\\nHello.\\n</text>"}', '  hello.\n').text, '  Hello.\n');
});

test('parseResult: rejects garbage', () => {
  assert.throws(() => parseResult('I cannot help with that', 'x'));
  assert.throws(() => parseResult('{"answer":"x"}', 'x'));
});

test('buildMessages: check vs rewrite', () => {
  const c = buildMessages('hi', { mode: 'check' });
  assert.match(c[0].content, /smallest changes/);
  assert.equal(c[1].content, '<text>\nhi\n</text>');
  const r = buildMessages('hi', { mode: 'rewrite', tone: 'friendly', formality: 1, dialect: 'British English' });
  assert.match(r[0].content, /friendly tone at formality level 1 of 5 \(very casual\)/);
  assert.match(r[0].content, /British English/);
});

test('config: every provider has a base URL except custom', () => {
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (id !== 'custom') assert.match(p.baseUrl, /^https?:\/\//, id);
  }
  const c = connectionFor(DEFAULTS);
  assert.equal(c.model, 'openrouter/free');
  assert.equal(c.fallbackModel, 'deepseek/deepseek-v4.1-flash');
  const saved = connectionFor({ ...DEFAULTS, connections: { openrouter: { apiKey: 'k', model: 'm' } } });
  assert.equal(saved.apiKey, 'k');
  assert.equal(saved.model, 'm');
});
