-- Butika push'u açmadan önce kuyruk kontrolü — SALT OKUNUR, hiçbir şeyi değiştirmez.
--
-- Sunucuda, PUSH_DELIVERY_ENABLED=true yapmadan HEMEN ÖNCE:
--   sudo -u postgres psql -d butika -f infra/scripts/push-preflight.sql > push-preflight-$(date +%F-%H%M).txt
--
-- Push kapalıyken de fiyat takibi bildirim oluşturur ve push cihazı olan
-- hesaplar için push_outbox'a iş yazar. Push açılınca işçi süresi dolmamış
-- (24 saatten yeni) ve gönderim anında hâlâ geçerli işleri GÖNDERİR; süresi
-- dolanlar gönderilmeden failed/Expired olur. Kontrolle açma arasında zaman
-- geçerse yeniden çalıştırın. Ortak inceleme hesabının (REVIEW_AUTH_EMAIL)
-- işleri REVIEW_AUTH_ENABLED ne olursa olsun gönderilmez, gönderim anında iptal
-- edilir; uygulama içi bildirimleri kalır.
--
-- Çıktıda token, e-posta veya bildirim metni yoktur; hesaplar yalnız kimlik
-- numarasıyla görünür. Üretimde REVIEW_AUTH_EMAIL değiştirildiyse
-- 'review@butika.ai' değerlerini onunla değiştirin.

SET default_transaction_read_only = on;
SET statement_timeout = '30s';

\echo '== 1. Kuyruk durumu — push hiç açılmadıysa satır yok ya da yalnız pending =='
SELECT status,
       count(*) AS isler,
       count(*) FILTER (WHERE expires_at <= now()) AS suresi_dolmus,
       count(*) FILTER (WHERE expires_at > now()) AS suresi_dolmamis,
       min(created_at) AS en_eski,
       max(created_at) AS en_yeni
FROM push_outbox
GROUP BY status
ORDER BY status;

\echo '== 2. Push açılınca işlenecek işler (süresi dolmamış) — tür ve yaşa göre =='
SELECT n.type AS tur,
       o.status,
       CASE WHEN o.created_at > now() - interval '1 hour' THEN '0-1 saat'
            WHEN o.created_at > now() - interval '6 hours' THEN '1-6 saat'
            ELSE '6-24 saat' END AS yas,
       count(*) AS isler,
       count(DISTINCT n.user_id) AS hesaplar,
       count(DISTINCT o.device_id) AS cihazlar
FROM push_outbox o
JOIN notifications n ON n.id = o.notification_id
WHERE o.status IN ('pending', 'awaiting_receipt') AND o.expires_at > now()
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

\echo '== 3. Şimdi açılsa gidecekler (push işçisinin gönderim koşulları) — beklenen: satır yok ya da yalnız bilinen test hesapları; inceleme hesabının işleri gitmez, ayrı sayılır =='
WITH gecerli AS (
  SELECT n.type, n.user_id, o.created_at,
         coalesce(u.email = 'review@butika.ai', false) AS inceleme_hesabi
  FROM push_outbox o
  JOIN notifications n ON n.id = o.notification_id
  JOIN users u ON u.id = n.user_id
  JOIN push_devices d ON d.id = o.device_id AND d.expo_push_token = o.token
    AND d.user_id = n.user_id AND d.enabled
  LEFT JOIN price_drop_events pde ON pde.id = n.price_drop_event_id
  LEFT JOIN restock_events re ON re.id = n.restock_event_id
  JOIN tracked_products tp ON tp.id = coalesce(pde.tracked_product_id, re.tracked_product_id)
  WHERE o.status = 'pending' AND o.expires_at > now() AND o.attempts < 6
    AND u.deleted_at IS NULL
    AND tp.tracking_status = 'active' AND tp.availability = 'in_stock'
    AND tp.currency = coalesce(pde.currency, re.currency)
    AND tp.current_price_minor = coalesce(pde.new_price_minor, re.price_minor)
    AND tp.consecutive_failures = 0
    AND tp.last_success_at >= now() - interval '24 hours'
    AND EXISTS (SELECT 1 FROM saved_products sp
                WHERE sp.user_id = n.user_id AND sp.tracked_product_id = tp.id
                  AND (n.restock_event_id IS NOT NULL OR sp.tracking_started_at <= pde.detected_at))
)
SELECT type AS tur,
       count(*) FILTER (WHERE NOT inceleme_hesabi) AS gidecek_is,
       count(DISTINCT user_id) FILTER (WHERE NOT inceleme_hesabi) AS hesaplar,
       min(created_at) FILTER (WHERE NOT inceleme_hesabi) AS en_eski_is,
       count(*) FILTER (WHERE inceleme_hesabi) AS inceleme_hesabi_iptal
FROM gecerli
GROUP BY type
ORDER BY type;

\echo '== 4. Hedef hesaplar (süresi dolmamış işler) — tanınmayan hesap varsa açmadan önce karar verin; inceleme hesabının işleri gönderilmez =='
SELECT n.user_id AS hesap,
       coalesce(u.email = 'review@butika.ai', false) AS inceleme_hesabi,
       u.deleted_at IS NOT NULL AS silinmis,
       count(*) AS isler,
       count(DISTINCT o.device_id) AS cihazlar,
       string_agg(DISTINCT d.platform, ',') AS platformlar,
       min(o.created_at) AS en_eski_is
FROM push_outbox o
JOIN notifications n ON n.id = o.notification_id
JOIN users u ON u.id = n.user_id
LEFT JOIN push_devices d ON d.id = o.device_id
WHERE o.status IN ('pending', 'awaiting_receipt') AND o.expires_at > now()
GROUP BY 1, 2, 3
ORDER BY isler DESC
LIMIT 50;

\echo '== 5. Kayıtlı push cihazları — platform ve durum =='
SELECT d.platform,
       d.enabled,
       count(*) AS cihazlar,
       count(DISTINCT d.user_id) AS hesaplar,
       count(*) FILTER (WHERE u.email = 'review@butika.ai') AS inceleme_hesabinda,
       max(d.last_seen_at) AS son_gorulme
FROM push_devices d
JOIN users u ON u.id = d.user_id
GROUP BY 1, 2
ORDER BY 1, 2;

\echo '== 6. Ortak inceleme hesabı — satır yoksa inceleme girişi hiç kullanılmamış; bu hesaba push gitmez, cihaz sayısı hesabı kaç kişinin kullandığını gösterir =='
SELECT u.id AS hesap,
       u.created_at,
       u.last_seen_at,
       u.deleted_at,
       (SELECT count(*) FROM saved_products sp WHERE sp.user_id = u.id) AS kayitli_urun,
       (SELECT count(*) FROM saved_products sp WHERE sp.user_id = u.id AND sp.restock_alert_at IS NOT NULL) AS stok_alarmi,
       (SELECT count(*) FROM collections c WHERE c.user_id = u.id) AS koleksiyon,
       (SELECT count(*) FROM comments cm WHERE cm.user_id = u.id AND cm.deleted_at IS NULL) AS yorum,
       (SELECT count(*) FROM notifications nn WHERE nn.user_id = u.id) AS bildirim,
       (SELECT count(*) FROM push_devices pd WHERE pd.user_id = u.id AND pd.enabled) AS acik_push_cihazi,
       (SELECT count(*) FROM push_devices pd WHERE pd.user_id = u.id AND pd.last_seen_at > now() - interval '7 days') AS son_7_gunde_gorulen_cihaz
FROM users u
WHERE u.email = 'review@butika.ai';
