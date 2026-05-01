import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-ink-600">טוען...</div>
    </main>
  );
}
