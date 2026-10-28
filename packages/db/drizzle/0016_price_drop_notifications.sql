CREATE TABLE "price_drop_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_product_id" uuid NOT NULL,
	"price_history_id" uuid NOT NULL,
	"previous_price_minor" integer NOT NULL,
	"new_price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_drop_events_history_unique" UNIQUE("price_history_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text DEFAULT 'price_drop' NOT NULL,
	"price_drop_event_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_price_drop_unique" UNIQUE("user_id","price_drop_event_id")
);
--> statement-breakpoint
ALTER TABLE "price_drop_events" ADD CONSTRAINT "price_drop_events_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_drop_events" ADD CONSTRAINT "price_drop_events_price_history_id_product_price_history_id_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."product_price_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_price_drop_event_id_price_drop_events_id_fk" FOREIGN KEY ("price_drop_event_id") REFERENCES "public"."price_drop_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_drop_events_product_detected_idx" ON "price_drop_events" USING btree ("tracked_product_id","detected_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read_at");