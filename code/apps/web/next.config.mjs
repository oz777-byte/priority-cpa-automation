import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoEnv = resolve(__dirname, '../../.env.local');

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
  // .env.local missing; the app will throw a clear error on first env read
}

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
    SUPABASE_URL: envVars.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: envVars.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: envVars.SUPABASE_SECRET_KEY,
    NEXT_PUBLIC_SUPABASE_URL: envVars.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: envVars.SUPABASE_PUBLISHABLE_KEY,
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
