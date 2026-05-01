// One-off password reset using the service-role key.
//
// Usage:
//   npm run reset-password -- "<NewPassword>"          # resets oz@oz-nihul.com
//   npm run reset-password -- "<NewPassword>" "<email>"  # resets a specific user

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const newPassword = process.argv[2];
const email = process.argv[3] ?? 'oz@oz-nihul.com';

function abort(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!url) abort('SUPABASE_URL missing in .env.local');
if (!secretKey) abort('SUPABASE_SECRET_KEY missing in .env.local');
if (!newPassword) abort('Usage: npm run reset-password -- "<NewStrongPassword>" [email]');
if (newPassword.length < 12) abort('Password must be at least 12 characters');
if (!/[a-z]/.test(newPassword)) abort('Password must include a lowercase letter');
if (!/[A-Z]/.test(newPassword)) abort('Password must include an uppercase letter');
if (!/\d/.test(newPassword)) abort('Password must include a digit');

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (listError) abort(listError.message);

const user = data.users.find((u) => u.email === email);
if (!user) abort(`User ${email} not found`);

const { error } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
if (error) abort(error.message);

console.log(`\n✓ Password reset for ${email}\n`);
