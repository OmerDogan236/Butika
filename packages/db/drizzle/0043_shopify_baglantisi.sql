CREATE TABLE "shopify_uygulamalari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"magaza" text NOT NULL,
	"client_id" text NOT NULL,
	"secret_sifreli" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_uygulamalari_magaza_unique" UNIQUE("magaza")
);
--> statement-breakpoint
ALTER TABLE "baglanti_davetleri" ADD COLUMN "platform" text DEFAULT 'ikas' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "butik_baglantilari_platform_magaza_uq" ON "butik_baglantilari" USING btree ("platform","magaza_adi") WHERE "butik_baglantilari"."platform" = 'shopify';