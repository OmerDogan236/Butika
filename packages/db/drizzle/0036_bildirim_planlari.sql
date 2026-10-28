CREATE TABLE "bildirim_planlari" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"baslik" text NOT NULL,
	"metin" text NOT NULL,
	"kitle" text DEFAULT 'all' NOT NULL,
	"gonderim_zamani" timestamp with time zone NOT NULL,
	"durum" text DEFAULT 'taslak' NOT NULL,
	"alici_sayisi" integer,
	"basarili" integer,
	"hatali" integer,
	"gonderildi_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bildirim_planlari_durum_zaman_idx" ON "bildirim_planlari" USING btree ("durum","gonderim_zamani");