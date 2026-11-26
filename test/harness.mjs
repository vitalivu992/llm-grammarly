// Shared e2e helpers: a mock OpenAI-compatible server and a Chromium with the
// unpacked extension loaded.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const EXT = fileURLToPath(new URL('../src', import.meta.url));

export const PAGE = `<!doctype html><html><body style="font:16px sans-serif;padding:40px">
<textarea id="ta" rows="5" cols="60"></textarea><br><br>
<textarea id="ta2" rows="5" cols="60"></textarea><br><br>
<input id="pw" type="password"><br><br>
<div id="ce" contenteditable="true" style="border:1px solid #999;min-height:60px;width:500px"><p>We has <b>teh</b> plan ready now.</p></div><br>
<iframe id="frame" style="width:520px;height:120px" srcdoc="<textarea id='inner' rows='3' cols='50'></textarea>"></iframe>
</body></html>`;

const FIXES = [
  ['I has went', 'I went'],
  ['We has', 'We have'],
  ['teh', 'the'],
  ['recieve', 'receive'],
];
const REWRITES = { 'hey can u send the file asap': 'Hello, could you please send the file as soon as possible?' };

// Behaves like Ollama: rejects requests that carry a chrome-extension:// Origin.
// `respond(system, text)` may return { text, edits } to script the model's reply.
export function startMock({ page = PAGE, respond } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/page') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page);
    }
    if (req.headers.origin?.startsWith('chrome-extension://')) {
      res.writeHead(403);
      return res.end();
    }
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'mock' }, { id: 'broken' }] }));
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      let body = '';
      for await (const c of req) body += c;
      const { model, messages } = JSON.parse(body);
      requests.push({ model, origin: req.headers.origin, system: messages[0].content });
      if (model === 'broken') {
        res.writeHead(500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'upstream exploded' } }));
      }
      const text = messages[1].content.replace(/^<text>\n/, '').replace(/\n<\/text>$/, '');
      let out = text;
      let edits = [];
      const scripted = respond?.(messages[0].content, text);
      if (scripted) {
        ({ text: out, edits = [] } = scripted);
      } else if (/Rewrite the user's text/.test(messages[0].content)) {
        out = REWRITES[text.trim()] || text;
      } else {
        for (const [from, to] of FIXES) {
          if (out.includes(from)) {
            out = out.replaceAll(from, to);
            edits.push({ from, to, type: 'grammar', why: `use "${to}"` });
          }
        }
      }
      const content = `\`\`\`json\n${JSON.stringify({ text: out, edits })}\n\`\`\``;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port })),
  );
}

export async function launch(options = {}) {
  const context = await chromium.launchPersistentContext('', {
    ...options,
    channel: 'chromium',
    headless: !process.env.HEADED,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const extId = new URL(sw.url()).host;
  return { context, sw, extId };
}

export function configure(sw, settings) {
  return sw.evaluate((s) => chrome.storage.local.set({ settings: s }), settings);
}
