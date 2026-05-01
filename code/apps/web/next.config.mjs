import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoEnv = resolve(__dirname, '../../.env.local');

// Local-dev convenience: read code/.env.local into envVars so Next.js
// (which doesn't traverse to parent .env files) sees the values.
// On Vercel, this file does not exist; Vercel injects vars into process.env directly.
const envVars = {};
try {
  const content = readFileSync(monorepoEnv, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    envVars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
} catch {
  // .env.local missing (Vercel) — fall back to Vercel-injected process.env
}

function pick(key) {
  return envVars[key] ?? process.env[key] ?? '';
}

const SUPABASE_URL = pick('SUPABASE_URL');
const SUPABASE_PUBLISHABLE_KEY = pick('SUPABASE_PUBLISHABLE_KEY');
const SUPABASE_SECRET_KEY = pick('SUPABASE_SECRET_KEY');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@priority-cpa/db',
    '@priority-cpa/invoice-schema',
    '@priority-cpa/israeli-vat-logic',
    '@priority-cpa/je-validator',
    '@priority-cpa/movein-generator',
  ],
  env: {
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SUPABASE_PUBLISHABLE_KEY,
  },
  webpack: (config) => {
    // Skill packages are TypeScript ESM with .js imports (the strict-ESM
    // idiom). Tell webpack to resolve a .js import to a sibling .ts/.tsx file.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
