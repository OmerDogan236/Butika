CREATE TABLE "vitrin_ayarlari" (
	"country_code" text PRIMARY KEY NOT NULL,
	"secki_basligi" text,
	"guncel_surum_ios" text,
	"guncel_surum_android" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "firsat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "firsat_notu" text;--> statement-breakpoint
ALTER TABLE "boutiques" ADD COLUMN "firsat_sirasi" integer;--> statement-breakpoint
ALTER TABLE "vitrin_ayarlari" ADD CONSTRAINT "vitrin_ayarlari_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE cascade ON UPDATE no action;