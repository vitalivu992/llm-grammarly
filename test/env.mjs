// Read the OpenRouter key from the environment or the project .env file.
import { readFileSync } from 'node:fs';

export function loadEnvKey() {
  let key = process.env.OPENROUTER_API_KEY || process.env.OPENROUTE_API_KEY;
  if (!key) {
    try {
      const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
      const m = env.match(/^\s*OPENROUTE(?:R)?_API_KEY\s*=\s*"?([^"\n]+)"?/m);
      key = m?.[1]?.trim();
    } catch {}
  }
  return key || '';
}
