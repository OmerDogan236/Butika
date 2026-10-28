'use client';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  type AdminBildirimKitleSayilari,
  BILDIRIM_BASLIK_MAKS,
  BILDIRIM_METIN_MAKS,
} from '@butika/types';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type BildirimSonuc, bildirimOlustur } from './actions';

function Gonder() {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" name="durum" value="planlandi" variant="gold" disabled={pending}>
        {pending ? 'Kaydediliyor…' : 'Planla'}
      </Button>
      <Button type="submit" name="durum" value="taslak" variant="outline" disabled={pending}>
        Taslak olarak kaydet
      </Button>
    </div>
  );
}

export type Secenek = { id: string; name: string };

const SECIM = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

/** Yeni bildirim: başlık, metin, kitle, dokununca ne açılacağı ve Türkiye saatiyle zaman. */
export function BildirimFormu({
  kitle,
  varsayilanTarih,
  butikler,
  kategoriler,
}: {
  kitle: AdminBildirimKitleSayilari;
  varsayilanTarih: string;
  butikler: Secenek[];
  kategoriler: Secenek[];
}) {
  const [state, formAction] = useActionState<BildirimSonuc | undefined, FormData>(
    bildirimOlustur,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [baslik, setBaslik] = useState('');
  const [metin, setMetin] = useState('');
  const [hedefTuru, setHedefTuru] = useState('');
  const adaGore = (l: Secenek[]) => [...l].sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  // Başarılı kayıttan sonra metin alanları boşalsın (tarih/saat kalsın: aynı güne 3 bildirim).
  useEffect(() => {
    if (state?.ok) {
      setBaslik('');
      setMetin('');
      setHedefTuru('');
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex max-w-2xl flex-col gap-5 border border-mist p-6"
    >
      <h2 className="font-display text-2xl italic text-ink">Yeni bildirim</h2>

      <Field label={`Başlık (${baslik.length}/${BILDIRIM_BASLIK_MAKS})`} htmlFor="baslik">
        <Input
          id="baslik"
          name="baslik"
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          maxLength={BILDIRIM_BASLIK_MAKS}
          placeholder="Sonbahar Seçkisi vitrinde 🍂"
          required
        />
      </Field>

      <Field
        label={`Metin (${metin.length}/${BILDIRIM_METIN_MAKS})`}
        htmlFor="metin"
        hint="Kilit ekranında genelde ilk 2 satır görünür; asıl mesajı başa yazın."
      >
        <Textarea
          id="metin"
          name="metin"
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          maxLength={BILDIRIM_METIN_MAKS}
          rows={3}
          placeholder="Bu sezon için seçtiğimiz butikler seni bekliyor."
          required
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Tarih" htmlFor="tarih">
          <Input id="tarih" name="tarih" type="date" defaultValue={varsayilanTarih} required />
        </Field>
        <Field label="Saat (Türkiye)" htmlFor="saat">
          <Input id="saat" name="saat" type="time" defaultValue="12:30" required />
        </Field>
        <Field label="Kime" htmlFor="kitle">
          <select
            id="kitle"
            name="kitle"
            defaultValue="all"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">Herkes ({kitle.all.kisi} kişi)</option>
            <option value="savers">Fiyat takibi olanlar ({kitle.savers.kisi} kişi)</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Dokununca ne açılsın"
          htmlFor="hedefTuru"
          hint="Uygulamanın 1.2.1'den eski sürümlerinde yalnız uygulama açılır."
        >
          <select
            id="hedefTuru"
            name="hedefTuru"
            value={hedefTuru}
            onChange={(e) => setHedefTuru(e.target.value)}
            className={SECIM}
          >
            <option value="">Yalnız uygulama</option>
            <option value="vitrin">Vitrin</option>
            <option value="firsat">Fırsat</option>
            <option value="butikcan">Butikcan</option>
            <option value="guncelleme">Mağazadaki güncelleme sayfası</option>
            <option value="butik">Belirli bir butik</option>
            <option value="kategori">Vitrinde bir kategori</option>
          </select>
        </Field>
        {hedefTuru === 'butik' || hedefTuru === 'kategori' ? (
          <Field label={hedefTuru === 'butik' ? 'Butik' : 'Kategori'} htmlFor="hedefId">
            <select id="hedefId" name="hedefId" required className={SECIM} defaultValue="">
              <option value="" disabled>
                Seçin
              </option>
              {adaGore(hedefTuru === 'butik' ? butikler : kategoriler).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      <p className="text-xs text-ink/50">
        “Planla” dediğinizde zamanı gelince kendiliğinden gider. Taslaklar siz onaylayana kadar
        gitmez. Bir saatten fazla gecikirse (ör. sunucu kapalıysa) gönderilmez.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Gonder />
        {state?.error ? <p className="text-sm text-clay">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-sage">Kaydedildi</p> : null}
      </div>
    </form>
  );
}
