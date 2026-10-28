ALTER TABLE "tracked_products" ADD COLUMN "next_check_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "check_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "check_lease_token" uuid;--> statement-breakpoint
CREATE INDEX "tracked_products_due_idx" ON "tracked_products" USING btree ("tracking_status","next_check_at");