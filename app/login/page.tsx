import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { loadUserId } from '@/lib/credentials';
import { LoginForm } from '../components/LoginForm';

export const metadata: Metadata = { title: 'Log in' };

async function Login({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const sp = await searchParams;
  await connection();
  const next = sp.next === '/widget' ? '/widget' : '/';
  const defaultUserId = (await loadUserId()) ?? '';

  return (
    <div className="mx-auto max-w-sm rounded-xl bg-neutral-500/10 p-6">
      <h1 className="mb-1 text-lg font-semibold">Log in with your Decibel account</h1>
      <p className="mb-4 text-sm opacity-70">
        Your password is stored encrypted on this PC for your Windows account only.
      </p>
      <LoginForm defaultUserId={defaultUserId} next={next} />
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="w-full px-4 py-8">
      <Suspense fallback={<p className="opacity-60">Loading…</p>}>
        <Login searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
