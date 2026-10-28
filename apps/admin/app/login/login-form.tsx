'use client';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type LoginState, loginAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState | undefined, FormData>(
    loginAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="E-posta" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Şifre" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      {state?.error && (
        <p className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
