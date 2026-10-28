CREATE TABLE "outreach_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outreach_email_id" uuid NOT NULL,
	"event" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_contact_id" uuid,
	"domain" text,
	"recipient_email" text NOT NULL,
	"campaign" text NOT NULL,
	"subject" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"brevo_message_id" text,
	"status" text DEFAULT 'hazirlaniyor' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"last_event_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outreach_email_events" ADD CONSTRAINT "outreach_email_events_outreach_email_id_outreach_emails_id_fk" FOREIGN KEY ("outreach_email_id") REFERENCES "public"."outreach_emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_emails" ADD CONSTRAINT "outreach_emails_brand_contact_id_brand_contacts_id_fk" FOREIGN KEY ("brand_contact_id") REFERENCES "public"."brand_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_email_events_unique" ON "outreach_email_events" USING btree ("outreach_email_id","event","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_emails_domain_campaign_unique" ON "outreach_emails" USING btree ("domain","campaign") WHERE is_test = false;--> statement-breakpoint
CREATE INDEX "outreach_emails_message_idx" ON "outreach_emails" USING btree ("brevo_message_id");--> statement-breakpoint
CREATE INDEX "outreach_emails_status_idx" ON "outreach_emails" USING btree ("status","created_at");