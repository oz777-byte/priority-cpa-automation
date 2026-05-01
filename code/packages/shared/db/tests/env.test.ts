import { describe, it, expect } from 'vitest';
import { readSupabaseEnv, readAdminEnv } from '../src/index.js';

describe('readSupabaseEnv', () => {
  it('parses a valid env', () => {
    const env = readSupabaseEnv({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_aaaaaaaaaaaaaaaaaaaa',
    });
    expect(env.SUPABASE_URL).toBe('https://abc.supabase.co');
  });

  it('rejects a non-URL', () => {
    expect(() =>
      readSupabaseEnv({
        SUPABASE_URL: 'not-a-url',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_aaaaaaaaaaaaaaaaaaaa',
      }),
    ).toThrow();
  });

  it('rejects a too-short key', () => {
    expect(() =>
      readSupabaseEnv({
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'short',
      }),
    ).toThrow();
  });
});

describe('readAdminEnv', () => {
  it('requires the secret key', () => {
    expect(() =>
      readAdminEnv({
        SUPABASE_URL: 'https://abc.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_aaaaaaaaaaaaaaaaaaaa',
      }),
    ).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('passes when secret key is present', () => {
    const env = readAdminEnv({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_aaaaaaaaaaaaaaaaaaaa',
      SUPABASE_SECRET_KEY: 'sb_secret_aaaaaaaaaaaaaaaaaaaa',
    });
    expect(env.SUPABASE_SECRET_KEY).toBeTruthy();
  });
});
