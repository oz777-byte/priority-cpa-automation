import { Suspense } from 'react';
import Image from 'next/image';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-brand-radial text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <Image
            src="/os-tech-logo.jpg"
            alt="O.S Tech Ventures"
            width={96}
            height={42}
            className="mx-auto rounded-lg object-contain bg-black/40 p-1"
            priority
          />
          <div className="text-[10px] text-brand-300 tracking-widest uppercase">
            Automate · Optimize · Grow
          </div>
        </div>
        <Suspense fallback={<Fallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

function Fallback() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-white/60">
      טוען...
    </div>
  );
}
