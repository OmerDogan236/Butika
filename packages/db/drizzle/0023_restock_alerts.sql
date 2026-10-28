CREATE TABLE "restock_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_product_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"previous_price_minor" integer,
	"currency" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restock_events_product_detected_unique" UNIQUE("tracked_product_id","detected_at")
);
--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "price_drop_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "restock_alert_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "saved_products" ADD COLUMN "restock_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "restock_event_id" uuid;--> statement-breakpoint
ALTER TABLE "restock_events" ADD CONSTRAINT "restock_events_tracked_product_id_tracked_products_id_fk" FOREIGN KEY ("tracked_product_id") REFERENCES "public"."tracked_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restock_event_id_restock_events_id_fk" FOREIGN KEY ("restock_event_id") REFERENCES "public"."restock_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_restock_unique" UNIQUE("user_id","restock_event_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_kind" CHECK ((type = 'price_drop' and price_drop_event_id is not null and restock_event_id is null)
      or (type = 'back_in_stock' and restock_event_id is not null and price_drop_event_id is null));