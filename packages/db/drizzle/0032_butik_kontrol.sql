CREATE TABLE "butik_kontrol_bulgulari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tur_id" uuid NOT NULL,
	"boutique_id" uuid NOT NULL,
	"tur" text NOT NULL,
	"onem" text NOT NULL,
	"yeni" boolean DEFAULT true NOT NULL,
	"kanit" text NOT NULL,
	"onceki_deger" text,
	"simdiki_deger" text,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "butik_kontrol_turlari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baslangic" timestamp with time zone DEFAULT now() NOT NULL,
	"bitis" timestamp with time zone,
	"durum" text DEFAULT 'suruyor' NOT NULL,
	"tetik" text NOT NULL,
	"kontrol_edilen" integer DEFAULT 0 NOT NULL,
	"sorunlu" integer DEFAULT 0 NOT NULL,
	"sayilar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ozet" text,
	"eposta_gonderildi_at" timestamp with time zone,
	"hafta_anahtari" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "butik_site_durumu" (
	"boutique_id" uuid PRIMARY KEY NOT NULL,
	"son_alan_adi" text,
	"son_para_birimi" text,
	"son_baslik" text,
	"ardisik_acilmama" integer DEFAULT 0 NOT NULL,
	"son_kontrol" timestamp with time zone,
	"yoksay" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tur_id" uuid
);
--> statement-breakpoint
ALTER TABLE "butik_kontrol_bulgulari" ADD CONSTRAINT "butik_kontrol_bulgulari_tur_id_butik_kontrol_turlari_id_fk" FOREIGN KEY ("tur_id") REFERENCES "public"."butik_kontrol_turlari"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_kontrol_bulgulari" ADD CONSTRAINT "butik_kontrol_bulgulari_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "butik_site_durumu" ADD CONSTRAINT "butik_site_durumu_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "butik_kontrol_bulgulari_tur_idx" ON "butik_kontrol_bulgulari" USING btree ("tur_id");--> statement-breakpoint
CREATE INDEX "butik_kontrol_bulgulari_boutique_idx" ON "butik_kontrol_bulgulari" USING btree ("boutique_id");--> statement-breakpoint
CREATE UNIQUE INDEX "butik_kontrol_turlari_hafta_tetik_uniq" ON "butik_kontrol_turlari" USING btree ("hafta_anahtari","tetik") WHERE "butik_kontrol_turlari"."tetik" = 'haftalik';