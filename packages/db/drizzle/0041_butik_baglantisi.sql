CREATE TABLE "baglanti_davetleri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"boutique_id" uuid NOT NULL,
	"olusturan" text,
	"kullanildi_at" timestamp with time zone,
	"iptal_at" timestamp with time zone,
	"magaza_adi" text,
	"magaza_adi_kaynak" text,
	"durum_anahtari" text,
	"durum_at" timestamp with time zone,
	"onaylayan_ad" text,
	"iletisim_eposta" text,
	"sartlar_surumu" text,
	"onay_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "baglanti_davetleri_token_unique" UNIQUE("token"),
	CONSTRAINT "baglanti_davetleri_durumAnahtari_unique" UNIQUE("durum_anahtari")
);
--> statement-breakpoint
CREATE TABLE "butik_baglantilari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boutique_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"magaza_adi" text NOT NULL,
	"kimlik_sifreli" text NOT NULL,
	"ikas_yetkili_uygulama_id" text,
	"ikas_merchant_id" text,
	"baglandi_at" timestamp with time zone,
	"durum" text NOT NULL,
	"tahsilat" text DEFAULT 'deneme' NOT NULL,
	"iletisim_eposta" text NOT NULL,
	"onaylayan_ad" text NOT NULL,
	"sartlar_surumu" text NOT NULL,
	"onay_at" timestamp with time zone NOT NULL,
	"son_urun_esitleme_at" timestamp with time zone,
	"son_siparis_tarama_at" timestamp with time zone,
	"son_ozet_ayi" text,
	"iade_politikasi" text,
	"son_hata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "butik_baglantilari_boutiqueId_unique" UNIQUE("boutique_id"),
	CONSTRAINT "butik_baglantilari_ikasYetkiliUygulamaId_unique" UNIQUE("ikas_yetkili_uygulama_id")
);
--> statement-breakpoint
CREATE TABLE "baglanti_urunleri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baglanti_id" uuid NOT NULL,
	"boutique_id" uuid NOT NULL,
	"dis_urun_id" text,
	"dis_varyant_id" text,
	"ad" text,
	"aciklama" text,
	"url" text NOT NULL,
	"gorseller" jsonb,
	"fiyat_minor" integer,
	"indirimli_fiyat_minor" integer,
	"currency" text,
	"stokta" boolean,
	"stok_adedi" integer,
	"secenekler" jsonb,
	"kategori" text,
	"aktif" boolean DEFAULT true NOT NULL,
	"son_gorulme_at" timestamp with time zone NOT NULL,
	CONSTRAINT "baglanti_urunleri_dis_uniq" UNIQUE NULLS NOT DISTINCT("baglanti_id","dis_urun_id","dis_varyant_id")
);
--> statement-breakpoint
CREATE TABLE "gonderimler" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"boutique_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kaynak" text DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "butik_siparisleri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baglanti_id" uuid NOT NULL,
	"boutique_id" uuid NOT NULL,
	"dis_siparis_id" text NOT NULL,
	"siparis_no" text NOT NULL,
	"siparis_at" timestamp with time zone NOT NULL,
	"gonderim_id" text,
	"user_id" uuid,
	"durum" text NOT NULL,
	"odendi" boolean NOT NULL,
	"tutar_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"satirlar" jsonb,
	"kargo_firmasi" text,
	"takip_no" text,
	"takip_url" text,
	"komisyon_minor" integer,
	"komisyon_at" timestamp with time zone,
	"iptal_goruldu_at" timestamp with time zone,
	"dis_guncelleme_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "butik_siparisleri_dis_uniq" UNIQUE("baglanti_id","dis_siparis_id")
);
--> statement-breakpoint
ALTER TABLE "baglanti_davetleri" ADD CONSTRAINT "baglanti_davetleri_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_baglantilari" ADD CONSTRAINT "butik_baglantilari_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baglanti_urunleri" ADD CONSTRAINT "baglanti_urunleri_baglanti_id_butik_baglantilari_id_fk" FOREIGN KEY ("baglanti_id") REFERENCES "public"."butik_baglantilari"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baglanti_urunleri" ADD CONSTRAINT "baglanti_urunleri_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gonderimler" ADD CONSTRAINT "gonderimler_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gonderimler" ADD CONSTRAINT "gonderimler_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_siparisleri" ADD CONSTRAINT "butik_siparisleri_baglanti_id_butik_baglantilari_id_fk" FOREIGN KEY ("baglanti_id") REFERENCES "public"."butik_baglantilari"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_siparisleri" ADD CONSTRAINT "butik_siparisleri_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_siparisleri" ADD CONSTRAINT "butik_siparisleri_gonderim_id_gonderimler_id_fk" FOREIGN KEY ("gonderim_id") REFERENCES "public"."gonderimler"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_siparisleri" ADD CONSTRAINT "butik_siparisleri_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "butik_baglantilari_durum_idx" ON "butik_baglantilari" USING btree ("durum");--> statement-breakpoint
CREATE INDEX "baglanti_urunleri_url_idx" ON "baglanti_urunleri" USING btree ("url");--> statement-breakpoint
CREATE INDEX "gonderimler_boutique_created_idx" ON "gonderimler" USING btree ("boutique_id","created_at");--> statement-breakpoint
CREATE INDEX "butik_siparisleri_user_idx" ON "butik_siparisleri" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "butik_siparisleri_boutique_siparis_idx" ON "butik_siparisleri" USING btree ("boutique_id","siparis_at");