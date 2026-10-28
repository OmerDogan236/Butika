'use client';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from './actions';

interface Category {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  cinsiyet: 'kadin' | 'erkek';
}

interface CategoryFormProps {
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
  initial?: Partial<Category>;
  // Hangi pazara ekleniyor/düzenleniyor (gizli alan olarak gönderilir).
  countryCode: string;
  submitLabel: string;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Kaydediliyor…' : label}
    </Button>
  );
}

export function CategoryForm({ action, initial, countryCode, submitLabel }: CategoryFormProps) {
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(action, undefined);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-6">
      <input type="hidden" name="countryCode" value={countryCode} />
      <Field label="Ad" htmlFor="name">
        <Input id="name" name="name" defaultValue={initial?.name ?? ''} required maxLength={64} />
      </Field>
      <Field
        label="Slug"
        htmlFor="slug"
        hint="Boş bırakırsan ad'dan üretilir. Türkçe/boşluk/büyük harf otomatik temizlenir."
      >
        <Input id="slug" name="slug" defaultValue={initial?.slug ?? ''} maxLength={64} />
      </Field>
      <Field
        label="Vitrin"
        htmlFor="cinsiyet"
        hint="Uygulamada Keşfet'in üstündeki KADIN | ERKEK geçişinde hangisinde görünsün."
      >
        <select
          id="cinsiyet"
          name="cinsiyet"
          defaultValue={initial?.cinsiyet ?? 'kadin'}
          className="h-11 rounded-md border border-ink/15 bg-cream px-3 text-sm text-ink"
        >
          <option value="kadin">Kadın</option>
          <option value="erkek">Erkek</option>
        </select>
      </Field>
      <label className="flex items-center gap-3 text-sm text-ink/80">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={initial?.isActive ?? true}
          className="h-4 w-4 accent-gold"
        />
        Aktif
      </label>
      {state?.error && (
        <p className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Submit label={submitLabel} />
        <Button asChild variant="ghost" size="lg">
          <Link href="/categories">Vazgeç</Link>
        </Button>
      </div>
    </form>
  );
}
