-- Admin panelinden ELLE atanan fiyat segmentleri için yeni güven değeri.
--
-- Neden gerekli: otomatik hesaplama (fiyat_segmenti.py) periyodik olarak
-- yeniden çalışıyor. Bu işaret olmasaydı, elle tek tek verilmiş kararları
-- bir sonraki tur sessizce ezerdi.
--
-- Yalnız CHECK kısıtı genişler; veri değişmez, geri alınabilir.

ALTER TABLE boutiques
  DROP CONSTRAINT IF EXISTS boutiques_fiyat_guven_check;

ALTER TABLE boutiques
  ADD CONSTRAINT boutiques_fiyat_guven_check
  CHECK (
    fiyat_guven IS NULL
    OR fiyat_guven IN (
      'tam', 'yetersiz_veri', 'kategori_belirsiz', 'para_birimi_supheli',
      'yan_urun_elendi', 'fiyat_supheli', 'elle_atandi'
    )
  );
