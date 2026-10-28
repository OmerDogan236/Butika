import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Giriş · Butika Admin' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <header className="mb-12 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/50">Butika</p>
          <h1 className="mt-4 font-display text-5xl italic leading-none text-ink">Admin</h1>
          <div className="mx-auto mt-6 h-px w-16 bg-gold" />
          <p className="mt-6 text-sm text-ink/60">Editorial vitrine giriş yap</p>
        </header>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
