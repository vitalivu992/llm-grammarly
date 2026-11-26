# Privacy policy

_Last updated: 2026-11-27_

Penwright is a browser extension that sends the text you type to a language model **you
configure**, and shows its suggestions. It has no server of its own.

## What is sent, and where

- **Text from the field you are editing**, when you pause typing (if check-as-you-type
  is on) or when you click the badge or press Check, Rewrite, or Recheck. Only the
  focused field's text is sent, and only up to 8,000 characters.
- It goes **only to the base URL you set in the options** (for example OpenRouter,
  OpenAI, DeepSeek, or a server on your own machine), together with your API key for
  that provider and a fixed instruction prompt.
- Requests to OpenRouter also carry the header `X-Title: Penwright`, which OpenRouter
  uses to label usage in your account.

What that provider does with the text is governed by its own policy. Local providers
(Ollama, LM Studio, Unsloth Studio) keep everything on your machine.

Penwright never reads password fields, and skips code editors and fields that opt out
with `data-gramm="false"` or `data-penwright="off"`. You can turn it off per site.

## What is stored

In `chrome.storage.local`, on your device only:

- your provider settings (base URLs, API keys, model names),
- your preferences (tone, formality, timing, disabled sites).

Suggestions are cached in memory for the open tab and discarded when it closes.
Nothing is synced to other devices.

## What is not collected

No analytics, telemetry, tracking, advertising, or crash reporting. The extension makes
no network requests other than the model calls described above. Your data isn't sold or
shared with anyone.

## Permissions

| Permission | Why |
|---|---|
| Access to all sites (`<all_urls>`) | To show the badge in text fields on any page, and to call whichever model endpoint you configure. |
| `storage` | To keep your settings. |
| `declarativeNetRequestWithHostAccess` | To remove the `Origin` header from Penwright's own requests to `localhost`, so local servers such as Ollama accept them. |

## Contact

Questions or concerns: open an issue in the project repository.
