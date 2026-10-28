ALTER TABLE "saved_products" ADD COLUMN "sayfa_turu" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "urun_turu" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "urun_rengi" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "urun_malzemesi" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "etiketlendi_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "etiket_deneme" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "etiket_deneme_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "saved_products_etiket_bekleyen_idx" ON "saved_products" USING btree ("etiketlendi_at","etiket_deneme");