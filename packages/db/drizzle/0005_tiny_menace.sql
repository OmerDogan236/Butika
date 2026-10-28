CREATE TABLE "boutique_categories" (
	"boutique_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "boutique_categories_boutique_id_category_id_pk" PRIMARY KEY("boutique_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "boutiques" DROP CONSTRAINT "boutiques_category_id_categories_id_fk";
--> statement-breakpoint
DROP INDEX "boutiques_category_sort_idx";--> statement-breakpoint
ALTER TABLE "boutique_categories" ADD CONSTRAINT "boutique_categories_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boutique_categories" ADD CONSTRAINT "boutique_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boutique_categories_category_sort_idx" ON "boutique_categories" USING btree ("category_id","sort_order");--> statement-breakpoint
INSERT INTO "boutique_categories" ("boutique_id", "category_id", "sort_order")
SELECT "id", "category_id", "sort_order" FROM "boutiques";
--> statement-breakpoint
ALTER TABLE "boutiques" DROP COLUMN "category_id";
