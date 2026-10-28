CREATE TABLE "push_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"token" text NOT NULL,
	"message" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"receipt_attempts" integer DEFAULT 0 NOT NULL,
	"ticket_id" text,
	"accepted_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token" uuid,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_outbox_notification_device_unique" UNIQUE("notification_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "availability" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "notification_baseline_price_minor" integer;--> statement-breakpoint
ALTER TABLE "tracked_products" ADD COLUMN "notification_baseline_currency" text;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_outbox" ADD CONSTRAINT "push_outbox_device_id_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_outbox_due_idx" ON "push_outbox" USING btree ("status","next_attempt_at");