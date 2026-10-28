CREATE TABLE "tarz_testi_cevaplari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"test_surumu" integer NOT NULL,
	"senaryo_cevaplari" jsonb NOT NULL,
	"acik_tarzlar" text[] NOT NULL,
	"fiyat_segmentleri" text[] NOT NULL,
	"renkler" text[] NOT NULL,
	"tarz1" text,
	"tarz2" text,
	"senaryo_tarz1" text,
	"senaryo_tarz2" text,
	"favori_tarz1" text,
	"favori_tarz2" text,
	"esnek" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tarz_testi_cevaplari" ADD CONSTRAINT "tarz_testi_cevaplari_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tarz_testi_cevaplari_user_created_idx" ON "tarz_testi_cevaplari" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tarz_testi_cevaplari_created_idx" ON "tarz_testi_cevaplari" USING btree ("created_at" DESC NULLS LAST);