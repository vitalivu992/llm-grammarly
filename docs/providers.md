# Providers

Penwright talks to every provider through the OpenAI-compatible
`POST {base URL}/chat/completions` API. `GET {base URL}/models` powers the **Load
models** button. Each provider keeps its own base URL, key, model, and fallback model,
so you can switch between them without retyping.

| Provider | Base URL | Default model | Key |
|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `openrouter/free` → fallback `deepseek/deepseek-v4.1-flash` | required |
| OpenAI | `https://api.openai.com/v1` | `gpt-6-luna` | required |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` | required |
| Ollama | `http://localhost:11434/v1` | choose with *Load models* | none |
| LM Studio | `http://localhost:1234/v1` | choose with *Load models* | none |
| Unsloth Studio | `http://localhost:8888/v1` | choose with *Load models* | `sk-unsloth-…` |
| Custom | your URL | your model | optional |

## Fallback model

If the main model returns an error (rate limit, outage, unknown model, policy
rejection) or output that isn't the expected JSON, Penwright sends the same request to
the fallback model. After a failure the main model is skipped for 5 minutes, so a model
that is down doesn't add a failed round trip to every check. The panel header shows
which model answered.

## OpenRouter

Get a key at <https://openrouter.ai/keys>.

`openrouter/free` routes each request to whichever free model is available. Free models
are rate limited (roughly 20 requests per minute, and a daily cap that is higher once
your account has credits), so the default fallback is `deepseek/deepseek-v4.1-flash`:
fast, good at minimal edits, and cheap (about $0.05 per million input tokens and $0.20
per million output tokens at the time of writing). A typical check is a few hundred
tokens.

**Zero data retention.** Free models are served by providers that may log prompts. If
your OpenRouter [privacy settings](https://openrouter.ai/settings/privacy) require zero
data retention, OpenRouter refuses every free model with a `ZDR violation` error and the
fallback answers every request. To use free models, allow those providers in the privacy
settings. To never try free models, set the main model to the paid one and clear the
fallback.

Any OpenRouter model id works, e.g. `anthropic/claude-haiku-5.5`, `openai/gpt-6-luna`,
`google/gemma-4-31b-it:free`.

## OpenAI

Get a key at <https://platform.openai.com/api-keys>. Penwright requests JSON mode and
leaves the temperature at the model default (current OpenAI models reject other values).

## DeepSeek

Get a key at <https://platform.deepseek.com/api_keys>. `deepseek-flash` is the current
fast model; `deepseek-v4-pro` is the larger one.

## Ollama

```sh
ollama serve
ollama pull qwen3:4b      # or any instruction-tuned model
```

Then choose **Ollama**, press **Load models**, and pick one.

Ollama refuses requests from browser extensions unless `OLLAMA_ORIGINS` is set. You
don't need to set it: Penwright removes the `Origin` header from its own requests to
`localhost`, `127.0.0.1`, and `[::1]` with a `declarativeNetRequest` session rule that
matches only requests the extension itself starts. Web pages' requests to local servers
keep their `Origin`.

If Ollama runs on another machine, use **Custom** with that host's URL and start Ollama
with `OLLAMA_ORIGINS=chrome-extension://*`.

## LM Studio

Start the local server (Developer tab → Start server), load a model, then choose **LM
Studio** and press **Load models**. JSON mode isn't requested from local servers (LM
Studio rejects `json_object`); Penwright parses JSON out of the reply instead.

## Unsloth Studio

Start `unsloth studio` (default port 8888). Create an API key under your avatar →
Settings → API; it starts with `sk-unsloth-`. Only the model currently loaded in
Studio is served.

## Custom endpoint

Anything that implements OpenAI's `/chat/completions`: vLLM, llama.cpp `llama-server`,
LiteLLM, LocalAI, Groq, Together, Fireworks, Mistral, a corporate gateway… Enter the
base URL up to and including `/v1`.

## Choosing a model

Corrections need a model that follows instructions and returns JSON reliably. Small
local models (under ~4B parameters) tend to rephrase too much or break the JSON; the
fallback catches the second problem but not the first. Rewrites benefit more from larger
models than corrections do.

To compare models on OpenRouter, run `npm run bench -- model-a model-b` (see
[development](development.md)).
