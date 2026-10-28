CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"user_id" uuid,
	"visitor_id" text,
	"consent_type" text NOT NULL,
	"granted" boolean NOT NULL,
	"text_version" text NOT NULL,
	"source" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "consent_records_email_idx" ON "consent_records" USING btree ("email");--> statement-breakpoint
CREATE INDEX "consent_records_user_idx" ON "consent_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_records_created_idx" ON "consent_records" USING btree ("created_at" DESC NULLS LAST);