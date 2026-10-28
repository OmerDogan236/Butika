CREATE TABLE "tracked_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boutique_id" uuid NOT NULL,
	"canonical_url" text NOT NULL,
	"source_url" text NOT NULL,
	"domain" text NOT NULL,
	"source_product_id" text,
	"title" text,
	"current_price_minor" integer,
	"currency" text,
	"tracking_status" text DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_products_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "product_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_product_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "tracked_product_id" uuid;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD CONSTRAINT "tracked_products_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tracked_products_boutique_idx" ON "tracked_products" USING btree ("boutique_id");--> statement-breakpoint
CREATE INDEX "tracked_products_status_checked_idx" ON "tracked_products" USING btree ("tracking_status","last_checked_at");--> statement-breakpoint
CREATE INDEX "tracked_products_domain_product_idx" ON "tracked_products" USING btree ("domain","source_product_id");--> statement-breakpoint
CREATE INDEX "product_price_history_product_observed_idx" ON "product_price_history" USING btree ("tracked_product_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "saved_products" ADD CONSTRAINT "saved_products_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_products_tracked_product_idx" ON "saved_products" USING btree ("tracked_product_id");