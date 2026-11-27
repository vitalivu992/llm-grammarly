# Development

Penwright is plain JavaScript with no build step: `src/` *is* the unpacked extension.
Node (22+) is needed only for the tests and helper scripts.

```sh
npm install                      # Playwright (tests only)
npx playwright install chromium
```

Load `src/` via `chrome://extensions` → Developer mode → Load unpacked. After editing,
press the reload icon on the extension card and refresh the page you test on.

## Layout

```
src/
  manifest.json
  background.js          service worker: settings, LLM calls, local-Origin rule
  lib/config.js          provider presets, settings storage
  lib/llm.js             OpenAI-compatible client, fallback + cooldown
  lib/prompt.js          check/rewrite prompts, tolerant JSON parsing
  shared/constants.js    tones, formality levels, defaults (classic script)
  content/diff.js        word-level diff into per-word hunks
  content/field.js       read text from inputs/contenteditable, apply hunks back
  content/styles.js      badge/panel CSS (adopted into a shadow root)
  content/content.js     badge, panel, auto-check
  options/  popup/  ui/page.css  icons/
test/
  unit.test.mjs          diff, prompt parsing, config
  e2e.test.mjs           real extension in Chromium against a mock LLM server
  live.test.mjs          real OpenRouter calls (DeepSeek v4.1 Flash)
  harness.mjs            mock server + browser launcher
scripts/
  bench.mjs              compare models on OpenRouter
  screenshots.mjs        regenerate docs/screenshots
  package.mjs            build the Chromium and Firefox store zips
  publish.mjs            upload + submit to Chrome Web Store / Edge Add-ons (CI)
  amo-metadata.json      listing metadata for the first Firefox Add-ons submission
  icons.py               regenerate src/icons (Pillow)
```

## How a check flows

1. `content.js` tracks the focused editable (`field.js` → `resolve`) and debounces
   input.
2. It sends `{type: 'analyze', mode, text}` to the service worker. A newer request from
   the same frame aborts the older one.
3. `background.js` loads settings and calls `llm.js` → `analyze()`, which builds the
   prompt (`prompt.js`), posts to `/chat/completions`, and parses the reply. It tries
   the main model, then the fallback.
4. The model returns `{"text": <full revised text>, "edits": [{from, to, type, why}]}`.
   The panel does **not** trust the model's edit list for positions: `diff.js` diffs the
   original against `text` locally to get exact per-word hunks, and the model's `edits`
   only supply the labels and explanations.
5. Apply replaces the accepted hunks back to front: select the range (textarea
   `setSelectionRange`, or a DOM `Range` built from `field.js`'s text-offset → text-node
   map), then `document.execCommand('insertText')`. That path fires the native
   `beforeinput`/`input` events that frameworks such as React, ProseMirror, and Lexical
   listen to, and keeps the undo stack. If the field doesn't end up with the expected
   text, it falls back to replacing everything, then to the clipboard.

Design notes:

- **No inline underlines.** Mirroring a field's layout to draw underlines is fragile on
  rich editors; the badge + diff panel works everywhere.
- **Shadow DOM + constructed stylesheet** keeps page CSS out and isn't blocked by page
  CSP.
- **Prompt injection:** the text is wrapped in `<text>…</text>` and the prompt says it is
  content, not instructions. The live tests check that an embedded "ignore your
  instructions" survives unchanged.
- **Constants shared across contexts** live in `shared/constants.js`, a classic script
  that sets `globalThis.PWShared`; ES modules import it for its side effect, content
  scripts list it in the manifest.

## Tests

```sh
npm test               # unit + e2e (about 15 s, no network)
npm run test:unit
npm run test:e2e       # HEADED=1 to watch
npm run test:live      # real OpenRouter calls; needs a key
```

The e2e suite loads the real extension in Playwright's Chromium and points it at a mock
server in `harness.mjs` that behaves like Ollama (it returns 403 to any request carrying
a `chrome-extension://` Origin, so the tests also cover the Origin-stripping rule). It
covers textarea, contenteditable (formatting kept), and iframe fields, skipping a change,
rewrite with tone/formality, fallback, ignored fields and disabled sites, the options
page, and the popup.

The live tests and the benchmark read `OPENROUTER_API_KEY` from the environment, or
`OPENROUTER_API_KEY` / `OPENROUTE_API_KEY` from a `.env` file in the project root
(git-ignored). They use `deepseek/deepseek-v4.1-flash`; a full run costs a fraction of
a cent.

## Benchmarking models

```sh
npm run bench -- deepseek/deepseek-v4.1-flash google/gemma-4-31b-it:free
```

Prints latency, the number of edits, and the output for a few fixed samples, including a
prompt-injection sample.

## Screenshots and icons

```sh
npm run screenshots    # docs/screenshots/*.png, model replies scripted for repeatability
npm run icons          # src/icons/*.png
```

## Releasing

Versions live in git tags (`vX.Y.Z`); the `version` in `src/manifest.json` and
`package.json` is stamped by CI at build time, so do not bump it by hand.

- **Push to `master`/`main`**: the `release` workflow computes the next patch version from
  the latest tag, tests and packages it, and, if that succeeds, tags the commit. It does
  not publish.
- **Release** (Actions → release → Run workflow): same, but bumps the minor version and
  resets the patch. Tick **publish** to also submit to all three stores. Each store is a
  separate job, so one failing store does not block the others.
- **Re-publish**: re-run the publish jobs of the run that built the version. Each job
  rebuilds the package for that run's version from the same commit; it does not use the
  `packages` artifact, which Gitea only exposes to jobs of the attempt that uploaded it.

`npm run zip` builds the packages locally:

- `dist/penwright-<version>-chromium.zip` for the Chrome Web Store and Edge Add-ons;
- `dist/penwright-<version>-firefox.zip` (and `dist/firefox/`) for Firefox Add-ons. It is
  the same code with a Firefox manifest: `background.scripts` instead of a service worker,
  and a `browser_specific_settings.gecko` block (id `penwright@lvsoftwares`, Firefox 142+,
  data collection `websiteContent`).

Use [privacy.md](privacy.md) as the privacy policy in every store, and declare that the
extension sends user text to a user-chosen AI provider.

### First submission

The Chrome and Edge APIs only update existing items, so upload the first Chromium zip by
hand in the [Chrome Web Store dashboard](https://chrome.google.com/webstore/devconsole)
and [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/). Firefox
can be created from CI: `web-ext sign` uses `scripts/amo-metadata.json` to create the
listing.

### Repository secrets

| Store | Secret | Where to get it |
|---|---|---|
| Chrome | `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` | Google Cloud OAuth client (Desktop app) with the Chrome Web Store API enabled. |
| Chrome | `CWS_REFRESH_TOKEN` | OAuth consent for scope `https://www.googleapis.com/auth/chromewebstore` ([guide](https://developer.chrome.com/docs/webstore/using-api)). |
| Chrome | `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID` | Developer dashboard → Account, and the item's ID. |
| Edge | `EDGE_CLIENT_ID`, `EDGE_API_KEY`, `EDGE_PRODUCT_ID` | Partner Center → Microsoft Edge → Publish API (API keys expire; renew them there). |
| Firefox | `AMO_JWT_ISSUER`, `AMO_JWT_SECRET` | [addons.mozilla.org/developers/addon/api/key](https://addons.mozilla.org/developers/addon/api/key/). |

## Contributing

Issues and pull requests are welcome. Please:

- keep it dependency-free at runtime and build-free;
- add or update a test for behaviour changes (`npm test` must pass);
- match the existing style (2-space indent, single quotes, semicolons);
- keep the UI in the Priority look (`content/styles.js`, `ui/page.css`): espresso,
  antique gold, cream, square corners, small tracked uppercase labels.
