import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(here, '../../../.env.local');

let env: Record<string, string> = {};
try {
  const content = readFileSync(envFile, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key && value) env[key] = value;
  }
} catch {
  // .env.local not present — integration tests will skip themselves
}

export default defineConfig({
  test: {
    env,
  },
});
