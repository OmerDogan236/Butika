CREATE TABLE "countries" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_language" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Mevcut tüm içerik TR pazarına ait. countryCode backfill'i için TR satırı şart;
-- FK kısıtları da bu satıra dayanır.
INSERT INTO "countries" ("code", "name", "default_language", "is_active", "sort_order")
VALUES ('TR', 'Türkiye', 'tr', true, 0)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_slug_unique";--> statement-breakpoint
ALTER TABLE "boutique_suggestions" ADD COLUMN "country_code" text;--> statement-breakpoint
-- boutiques/categories.country_code: önce nullable ekle → mevcut kayıtları TR yap → NOT NULL.
ALTER TABLE "boutiques" ADD COLUMN "country_code" text;--> statement-breakpoint
UPDATE "boutiques" SET "country_code" = 'TR' WHERE "country_code" IS NULL;--> statement-breakpoint
ALTER TABLE "boutiques" ALTER COLUMN "country_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "country_code" text;--> statement-breakpoint
UPDATE "categories" SET "country_code" = 'TR' WHERE "country_code" IS NULL;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "country_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "boutique_suggestions" ADD CONSTRAINT "boutique_suggestions_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boutiques" ADD CONSTRAINT "boutiques_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boutiques_country_active_sort_idx" ON "boutiques" USING btree ("country_code","is_active","sort_order");--> statement-breakpoint
CREATE INDEX "categories_country_active_sort_idx" ON "categories" USING btree ("country_code","is_active","sort_order");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_country_slug_unique" UNIQUE("country_code","slug");
