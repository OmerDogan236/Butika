'use client';

import { UploadField } from '@/components/UploadField';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from './actions';
import { EditorField } from './editor-field';
import { EtiketField } from './etiket-field';
import { FirsatField } from './firsat-field';
import { SegmentField } from './segment-field';
import { TarzField } from './tarz-field';
import { YasField } from './yas-field';

interface Category {
  id: string;
  name: string;
  slug: string;
  cinsiyet?: 'kadin' | 'erkek';
}

interface Boutique {
  id: string;
  categoryIds: string[];
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  fiyatSegmenti: string | null;
  fiyatGuven: string | null;
  temsiliFiyatTl: string | null;
  urunSayisiKategori: number | null;
  fiyatHesapTarihi: string | null;
  tarz1: string | null;
  tarz2: string | null;
  tarzGuven: string | null;
  tarzDurumu: string | null;
  tarzGerekce: string | null;
  tarzHesapTarihi: string | null;
  etiketler: string[] | null;
  hedefYaslar: string[] | null;
  yasGuven: string | null;
  editorSecimi: boolean;
  editorSirasi: number | null;
  editorNotu: string | null;
  firsat: boolean;
  firsatSirasi: number | null;
  firsatNotu: string | null;
}

interface BoutiqueFormProps {
  action: (prev: ActionResult | undefined, formData: FormData) => Promise<ActionResult>;
  initial?: Partial<Boutique>;
  categories: Category[];
  // Hangi pazara ekleniyor/düzenleniyor (gizli alan olarak gönderilir).
  countryCode: string;
  submitLabel: string;
  suggestionId?: string;
}

function Submit({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending || disabled}>
      {pending ? 'Kaydediliyor…' : label}
    </Button>
  );
}

export function BoutiqueForm({
  action,
  initial,
  categories,
  countryCode,
  submitLabel,
  suggestionId,
}: BoutiqueFormProps) {
  const [state, formAction] = useActionState<ActionResult | undefined, FormData>(action, undefined);
  const [coverImageUrl, setCoverImageUrl] = useState(initial?.coverImageUrl ?? null);
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? null);
  const [selectedCats, setSelectedCats] = useState<string[]>(
    initial?.categoryIds ?? (categories[0] ? [categories[0].id] : []),
  );
  const toggleCat = (id: string) =>
    setSelectedCats((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  return (
    <form action={formAction} className="grid max-w-3xl gap-x-12 gap-y-6 md:grid-cols-[1fr_auto]">
      <input type="hidden" name="countryCode" value={countryCode} />
      {suggestionId ? <input type="hidden" name="suggestionId" value={suggestionId} /> : null}
      <div className="flex flex-col gap-6">
        <Field label="Butik adı" htmlFor="name">
          <Input
            id="name"
            name="name"
            defaultValue={initial?.name ?? ''}
            required
            maxLength={120}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
            Kategoriler
          </legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const checked = selectedCats.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    'cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors',
                    checked
                      ? 'border-gold bg-gold/10 text-ink'
                      : 'border-input text-ink/60 hover:border-gold/40',
                    'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold has-[:focus-visible]:ring-offset-1',
                  )}
                >
                  <input
                    type="checkbox"
                    name="categoryId"
                    value={c.id}
                    checked={checked}
                    onChange={() => toggleCat(c.id)}
                    className="sr-only"
                  />
                  {c.name}
                  {c.cinsiyet === 'erkek' ? ' (Erkek)' : ''}
                </label>
              );
            })}
          </div>
          {selectedCats.length === 0 && (
            <p className="text-xs text-clay">En az bir kategori seç.</p>
          )}
        </fieldset>

        <Field label="Site Adresi" htmlFor="url" hint="https:// ile başlamalı">
          <Input
            id="url"
            name="url"
            type="url"
            defaultValue={initial?.url ?? ''}
            required
            placeholder="https://"
          />
        </Field>

        <Field label="Açıklama" htmlFor="description" hint="1-2 cümle, max 400 karakter">
          <Textarea
            id="description"
            name="description"
            defaultValue={initial?.description ?? ''}
            rows={3}
            maxLength={400}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Label>Görünürlük</Label>
          <label className="flex h-10 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial?.isActive ?? true}
              className="h-4 w-4 accent-gold"
            />
            <span>Mobile'da göster</span>
          </label>
        </div>

        {state?.error && (
          <p className="rounded-md border border-clay/30 bg-clay/5 px-3 py-2 text-sm text-clay">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Submit label={submitLabel} disabled={selectedCats.length === 0} />
          <Button asChild variant="ghost" size="lg">
            <Link href="/boutiques">Vazgeç</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <UploadField
          label="Kapak görseli"
          name="coverImageUrl"
          value={coverImageUrl}
          onChange={setCoverImageUrl}
          prefix="boutiques"
          hint="4:5 portrait önerilir"
        />
        <UploadField
          label="Logo (opsiyonel)"
          name="logoUrl"
          value={logoUrl}
          onChange={setLogoUrl}
          prefix="logos"
        />

        {/* Yeni ve düzenleme ekranında: butik eklenirken de seçilebilir. */}
        <EditorField
          editorSecimi={initial?.editorSecimi ?? false}
          editorSirasi={initial?.editorSirasi ?? null}
          editorNotu={initial?.editorNotu ?? null}
        />
        <FirsatField
          firsat={initial?.firsat ?? false}
          firsatSirasi={initial?.firsatSirasi ?? null}
          firsatNotu={initial?.firsatNotu ?? null}
        />

        {/* Yalnız düzenleme ekranında: yeni butik henüz taranmamıştır. */}
        {initial?.id ? (
          <SegmentField
            fiyatSegmenti={initial.fiyatSegmenti ?? null}
            fiyatGuven={initial.fiyatGuven ?? null}
            temsiliFiyatTl={initial.temsiliFiyatTl ?? null}
            urunSayisiKategori={initial.urunSayisiKategori ?? null}
            fiyatHesapTarihi={initial.fiyatHesapTarihi ?? null}
          />
        ) : null}
        {initial?.id ? (
          <TarzField
            tarz1={initial.tarz1 ?? null}
            tarz2={initial.tarz2 ?? null}
            tarzGuven={initial.tarzGuven ?? null}
            tarzDurumu={initial.tarzDurumu ?? null}
            tarzGerekce={initial.tarzGerekce ?? null}
            tarzHesapTarihi={initial.tarzHesapTarihi ?? null}
          />
        ) : null}
        {initial?.id ? (
          <YasField hedefYaslar={initial.hedefYaslar ?? null} yasGuven={initial.yasGuven ?? null} />
        ) : null}
        {initial?.id ? <EtiketField etiketler={initial.etiketler ?? []} /> : null}
      </div>
    </form>
  );
}
