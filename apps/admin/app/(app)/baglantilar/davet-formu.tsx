'use client';

import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { davetOlusturAction } from './actions';

type Platform = 'ikas' | 'shopify';

const ALAN = 'h-10 min-w-56 rounded-md border border-mist bg-transparent px-3 text-sm';

export function DavetFormu({
  butikler,
}: {
  butikler: { id: string; name: string; countryCode: string }[];
}) {
  const [platform, setPlatform] = useState<Platform>('ikas');
  const [butikId, setButikId] = useState('');
  const [magazaAdi, setMagazaAdi] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, basla] = useTransition();

  const shopify = platform === 'shopify';
  const hazir =
    !!butikId && (!shopify || (!!magazaAdi.trim() && !!clientId.trim() && !!clientSecret.trim()));

  function olustur() {
    setHata(null);
    setKopyalandi(false);
    // Secret yalnız bu istekte gider; gönderilince alandan silinir, geri gösterilmez.
    const secret = clientSecret;
    if (shopify) setClientSecret('');
    basla(async () => {
      try {
        const sonuc = shopify
          ? await davetOlusturAction({
              platform: 'shopify',
              boutiqueId: butikId,
              magazaAdi: magazaAdi.trim(),
              clientId: clientId.trim(),
              clientSecret: secret.trim(),
            })
          : await davetOlusturAction({
              platform: 'ikas',
              boutiqueId: butikId,
              magazaAdi: magazaAdi.trim() || undefined,
            });
        setLink(sonuc.link);
      } catch {
        setLink(null);
        setHata(
          shopify
            ? 'Davet linki oluşturulamadı. Mağaza adresini (xxx.myshopify.com) ve Client ID’yi kontrol edin, Client secret’ı yeniden yazın.'
            : 'Davet linki oluşturulamadı. ikas mağaza adını kontrol edin.',
        );
      }
    });
  }

  async function kopyala() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setKopyalandi(true);
    } catch {
      setHata('Kopyalanamadı, linki elle seçip kopyalayın.');
    }
  }

  return (
    <section className="mb-8 flex flex-col gap-4 border border-mist p-6">
      <h2 className="font-display text-xl italic text-ink">Davet linki oluştur</h2>
      <p className="text-sm text-ink/60">
        {shopify
          ? 'Butiği seçin; Shopify mağaza adresini (xxx.myshopify.com) ve bu mağaza için açılan Butika uygulamasının Client ID ve Client secret bilgisini yazın, linki butik sahibine gönderin.'
          : 'Butiği seçin, biliyorsanız ikas mağaza adını yazın (ör. lujo-studio), linki butik sahibine gönderin.'}{' '}
        Yeni link oluşturursanız aynı butiğin eski linki çalışmaz.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value as Platform);
            setMagazaAdi('');
            setClientId('');
            setClientSecret('');
            setLink(null);
          }}
          aria-label="Platform"
          className="h-10 rounded-md border border-mist bg-transparent px-3 text-sm"
        >
          <option value="ikas">ikas</option>
          <option value="shopify">Shopify</option>
        </select>
        <select
          value={butikId}
          onChange={(e) => {
            setButikId(e.target.value);
            setLink(null);
          }}
          className="h-10 min-w-64 rounded-md border border-mist bg-transparent px-3 text-sm"
        >
          <option value="">Butik seçin</option>
          {butikler.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.countryCode})
            </option>
          ))}
        </select>
        <input
          value={magazaAdi}
          onChange={(e) => {
            setMagazaAdi(e.target.value);
            setLink(null);
          }}
          placeholder={shopify ? 'magaza.myshopify.com' : 'ikas mağaza adı (isteğe bağlı)'}
          title={
            shopify
              ? 'Shopify mağazasının xxx.myshopify.com adresi; butik değiştiremez'
              : 'magazaadi.myikas.com adresindeki ilk kısım; boş bırakırsanız butik kendisi yazar'
          }
          className={ALAN}
        />
        {shopify && (
          <>
            <input
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setLink(null);
              }}
              placeholder="Client ID"
              autoComplete="off"
              className={ALAN}
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => {
                setClientSecret(e.target.value);
                setLink(null);
              }}
              placeholder="Client secret"
              autoComplete="new-password"
              className={ALAN}
            />
          </>
        )}
        <Button type="button" onClick={olustur} disabled={!hazir || bekliyor}>
          {bekliyor ? 'Oluşturuluyor…' : 'Davet linki oluştur'}
        </Button>
      </div>
      {link && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-md border border-mist bg-transparent px-3 text-sm"
          />
          <Button type="button" variant="outline" onClick={kopyala}>
            {kopyalandi ? 'Kopyalandı' : 'Linki kopyala'}
          </Button>
        </div>
      )}
      {hata && <p className="text-xs text-clay">{hata}</p>}
    </section>
  );
}
