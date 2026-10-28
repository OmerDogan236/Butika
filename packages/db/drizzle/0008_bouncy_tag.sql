ALTER TABLE "saved_products" ADD COLUMN "purchased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "order_number" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "saved_products_user_purchased_idx" ON "saved_products" USING btree ("user_id","purchased_at" DESC NULLS LAST);