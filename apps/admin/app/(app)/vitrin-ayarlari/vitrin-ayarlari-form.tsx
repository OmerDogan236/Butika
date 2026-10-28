'use client';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { type AdminVitrinAyari, SECKI_BASLIGI_MAKS } from '@butika/types';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { type VitrinAyarlariSonuc, vitrinAyarlariniKaydet } from './actions';

function Kaydet() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

/** Tek pazarın vitrin ayarları: seçki başlığı ve mağazadaki son sürümler. */
export function VitrinAyarlariForm({
  ayar,
  pazarAdi,
}: {
  ayar: AdminVitrinAyari;
  pazarAdi: string;
}) {
  const [state, formAction] = useActionState<VitrinAyarlariSonuc | undefined, FormData>(
    vitrinAyarlariniKaydet.bind(null, ayar.countryCode),
    undefined,
  );

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5 border-t border-mist pt-8">
      <h2 className="font-display text-3xl italic text-ink">{pazarAdi}</h2>

      <Field
        label="Seçki başlığı"
        htmlFor={`seckiBasligi-${ayar.countryCode}`}
        hint="Vitrindeki Editörün Seçimi şeridinin başlığı. Boşsa uygulama “Sizin için seçtiklerimiz” yazar."
      >
        <Input
          id={`seckiBasligi-${ayar.countryCode}`}
          name="seckiBasligi"
          defaultValue={ayar.seckiBasligi ?? ''}
          maxLength={SECKI_BASLIGI_MAKS}
          placeholder="Sonbahar seçkisi"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Güncel sürüm (iOS)"
          htmlFor={`guncelSurumIos-${ayar.countryCode}`}
          hint="App Store'daki son sürüm"
        >
          <Input
            id={`guncelSurumIos-${ayar.countryCode}`}
            name="guncelSurumIos"
            defaultValue={ayar.guncelSurumIos ?? ''}
            placeholder="1.2.0"
            inputMode="decimal"
          />
        </Field>
        <Field
          label="Güncel sürüm (Android)"
          htmlFor={`guncelSurumAndroid-${ayar.countryCode}`}
          hint="Google Play'deki son sürüm"
        >
          <Input
            id={`guncelSurumAndroid-${ayar.countryCode}`}
            name="guncelSurumAndroid"
            defaultValue={ayar.guncelSurumAndroid ?? ''}
            placeholder="1.2.0"
            inputMode="decimal"
          />
        </Field>
      </div>
      <p className="text-xs text-ink/50">
        Uygulamanın sürümü buradakinden eskiyse Ayarlar ekranının üstünde “Yeni sürüm var” kartı
        çıkar. Sürümü yalnız mağaza onayladıktan sonra yazın; boş bırakılırsa kart çıkmaz.
      </p>

      <div className="flex items-center gap-4">
        <Kaydet />
        {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-sage">Kaydedildi</p> : null}
      </div>
    </form>
  );
}
