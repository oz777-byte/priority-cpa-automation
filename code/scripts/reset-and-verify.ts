// Reset a user's password using the service-role key, then immediately
// verify the new password works via the publishable (anon) sign-in path.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const newPassword = process.argv[2];
const email = process.argv[3] ?? 'oz@oz-nihul.com';

function abort(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url) abort('SUPABASE_URL missing');
if (!secretKey) abort('SUPABASE_SECRET_KEY missing');
if (!publishableKey) abort('SUPABASE_PUBLISHABLE_KEY missing');
if (!newPassword) abort('Usage: <password> [email]');
if (newPassword.length < 12) abort('Password too short (12+)');

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 1. Find user
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listErr) abort(listErr.message);
const user = list.users.find((u) => u.email === email);
if (!user) abort(`User ${email} not found`);

console.log(`Found user: ${email} (id=${user.id})`);
console.log(`  email_confirmed_at: ${user.email_confirmed_at ?? 'NULL'}`);
console.log(`  banned_until: ${user.banned_until ?? 'no'}`);

// 2. Reset password + ensure email confirmed
const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
  password: newPassword,
  email_confirm: true,
});
if (updateErr) abort(updateErr.message);
console.log(`✓ Password reset and email confirmed`);

// 3. Verify by signing in with publishable client
const anon = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
  email,
  password: newPassword,
});
if (signinErr) abort(`Sign-in verification failed: ${signinErr.message}`);
if (!signin.session) abort('Sign-in returned no session');

console.log(`✓ Sign-in works. Token preview: ${signin.session.access_token.slice(0, 20)}...`);
console.log(`\nReady. Use:\n  email:    ${email}\n  password: ${newPassword}\n`);
