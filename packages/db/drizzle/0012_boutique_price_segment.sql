-- Butik fiyat segmenti alanları.
--
-- Kullanıcı butik keşfederken bütçesine göre süzebilsin diye eklendi.
-- Uygulamada RAKAM GÖSTERİLMEZ, yalnızca segment etiketi kullanılır;
-- temsili_fiyat_tl sadece sıralama ve denetim içindir.
--
-- Değerler tarama verisinden hesaplanır (bkz. fiyat_segmenti.py):
--   temsili fiyat = ana kategorideki ürünlerin kırpılmış ortancası
--   segment sınırları = tüm butiklerin çeyreklikleri (sabit TL eşiği YOK)
--
-- Hepsi NULL kabul eder: segment atanamayan butikler boş kalır.

ALTER TABLE boutiques
  ADD COLUMN IF NOT EXISTS fiyat_segmenti text,
  ADD COLUMN IF NOT EXISTS temsili_fiyat_tl numeric(12, 2),
  ADD COLUMN IF NOT EXISTS ana_kategori text,
  ADD COLUMN IF NOT EXISTS urun_sayisi_kategori integer,
  ADD COLUMN IF NOT EXISTS fiyat_guven text,
  ADD COLUMN IF NOT EXISTS fiyat_hesap_tarihi timestamptz;

-- Segment yalnızca bu dört değerden biri olabilir (ya da NULL).
ALTER TABLE boutiques
  DROP CONSTRAINT IF EXISTS boutiques_fiyat_segmenti_check;
ALTER TABLE boutiques
  ADD CONSTRAINT boutiques_fiyat_segmenti_check
  CHECK (fiyat_segmenti IS NULL OR fiyat_segmenti IN ('uygun', 'orta', 'yuksek', 'luks'));

-- Güven değeri de kapalı liste.
--
-- 2026-09-10 düzeltmesi: production'da 0012/0013 elle uygulandı ve Drizzle
-- journal'ına işlenmedi; migrator bu dosyayı orada YENİDEN çalıştırır. Liste
-- bu yüzden 0013'teki 'elle_atandi' değerini de içerir: aksi halde elle
-- atanmış butikler varken bu CHECK tüm migration transaction'ını geri alırdı.
-- 0013 sonrası son durum temiz kurulumda da aynıdır.
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

-- Segmente göre süzme ve sıralama için.
CREATE INDEX IF NOT EXISTS boutiques_fiyat_segmenti_idx
  ON boutiques (country_code, fiyat_segmenti)
  WHERE is_active;

-- 60 günden eski hesapları bulmak için (tazelenmeli kontrolü).
CREATE INDEX IF NOT EXISTS boutiques_fiyat_hesap_tarihi_idx
  ON boutiques (fiyat_hesap_tarihi);
