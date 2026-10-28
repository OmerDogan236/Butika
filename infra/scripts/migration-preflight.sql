-- Butika production migration ön kontrolü — SALT OKUNUR, hiçbir şeyi değiştirmez.
--
-- Sunucuda, deploy'dan ÖNCE:
--   sudo -u postgres psql -d butika -f infra/scripts/migration-preflight.sql > preflight-$(date +%F-%H%M).txt
--
-- Beklenenler her bölüm başlığında. Beklenmeyen bir sonuç varsa migration'a
-- geçmeyin; çıktıyı yayın notlarına ekleyin. Bir sorgunun hata vermesi de
-- bilgidir (ör. tablo/kolon hiç yok).

\echo '== 0. Sunucu =='
SELECT version();
SELECT current_database(), pg_size_pretty(pg_database_size(current_database())) AS db_size, now();

\echo '== 1. Drizzle journal — beklenen: 12 satır, son created_at = 1784119341102 (0011). 1787228400000 (0012) ve sonrası YOK =='
SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations_table;
SELECT id, created_at, to_timestamp(created_at / 1000.0) AS migration_time
FROM drizzle.__drizzle_migrations ORDER BY created_at;

\echo '== 2. 0012/0013 elle uygulanmış mı — beklenen: 6 kolon, 2 CHECK (guven listesinde elle_atandi), 2 index =='
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'boutiques'
  AND column_name IN ('fiyat_segmenti', 'temsili_fiyat_tl', 'ana_kategori', 'urun_sayisi_kategori', 'fiyat_guven', 'fiyat_hesap_tarihi')
ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.boutiques'::regclass AND conname LIKE 'boutiques_fiyat_%';
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'boutiques' AND indexname LIKE 'boutiques_fiyat_%';

\echo '== 3. 0012/0013 kısıtlarını ihlal edecek satır — beklenen: ikisi de 0 =='
SELECT fiyat_guven, count(*) FROM boutiques GROUP BY 1 ORDER BY 1;
SELECT fiyat_segmenti, count(*) FROM boutiques GROUP BY 1 ORDER BY 1;
SELECT count(*) AS invalid_fiyat_guven FROM boutiques
WHERE fiyat_guven IS NOT NULL AND fiyat_guven NOT IN (
  'tam', 'yetersiz_veri', 'kategori_belirsiz', 'para_birimi_supheli', 'yan_urun_elendi', 'fiyat_supheli', 'elle_atandi');
SELECT count(*) AS invalid_fiyat_segmenti FROM boutiques
WHERE fiyat_segmenti IS NOT NULL AND fiyat_segmenti NOT IN ('uygun', 'orta', 'yuksek', 'luks');

\echo '== 4. Yeni şema henüz yok — beklenen: hepsi boş (NULL) ve saved_products ek kolonu yok =='
SELECT to_regclass('public.tracked_products') AS tracked_products,
       to_regclass('public.product_price_history') AS product_price_history,
       to_regclass('public.price_drop_events') AS price_drop_events,
       to_regclass('public.notifications') AS notifications,
       to_regclass('public.push_devices') AS push_devices,
       to_regclass('public.push_outbox') AS push_outbox,
       to_regclass('public.retailer_request_gates') AS retailer_request_gates,
       to_regclass('public.restock_events') AS restock_events;
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'saved_products'
  AND column_name IN ('tracked_product_id', 'tracking_started_at', 'restock_alert_at', 'restock_confirmed_at');

\echo '== 5. Korunacak veri hacmi — migration sonrası aynı sayılar görülmeli =='
SELECT (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM users WHERE deleted_at IS NULL) AS active_users,
       (SELECT count(*) FROM saved_products) AS saved_products,
       (SELECT count(DISTINCT url) FROM saved_products) AS distinct_saved_urls,
       (SELECT count(*) FROM collections) AS collections,
       (SELECT count(*) FROM saved_product_collections) AS saved_product_collections,
       (SELECT count(*) FROM boutiques) AS boutiques,
       (SELECT count(*) FROM comments) AS comments;

\echo '== 6. Takip yükü tahmini — butik alan adıyla aynı host (yaklaşık; alt alan adları sayılmaz) =='
SELECT count(*) AS saved_total,
       count(*) FILTER (WHERE
         lower(split_part(regexp_replace(sp.url, '^https?://(www\.)?', ''), '/', 1)) =
         lower(split_part(regexp_replace(b.url, '^https?://(www\.)?', ''), '/', 1))) AS same_host_as_boutique
FROM saved_products sp JOIN boutiques b ON b.id = sp.boutique_id;
