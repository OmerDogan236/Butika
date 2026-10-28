CREATE TABLE "brand_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"email" text,
	"status" text DEFAULT 'bulunamadi' NOT NULL,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"do_not_contact_reason" text,
	"last_discovery_at" timestamp with time zone,
	"last_discovery_pages" integer,
	"last_discovery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_contacts_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "contact_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"source_url" text NOT NULL,
	"source_page_type" text NOT NULL,
	"found_in" text NOT NULL,
	"email_type" text NOT NULL,
	"confidence" text NOT NULL,
	"confidence_reason" text,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_candidates_brand_email_unique" UNIQUE("brand_contact_id","email")
);
--> statement-breakpoint
CREATE TABLE "contact_discovery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boutique_id" uuid,
	"domain" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"lease_token" uuid,
	"locked_until" timestamp with time zone,
	"batch_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_candidates" ADD CONSTRAINT "contact_candidates_brand_contact_id_brand_contacts_id_fk" FOREIGN KEY ("brand_contact_id") REFERENCES "public"."brand_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_discovery_jobs" ADD CONSTRAINT "contact_discovery_jobs_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_contacts_status_idx" ON "brand_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "contact_candidates_brand_idx" ON "contact_candidates" USING btree ("brand_contact_id");--> statement-breakpoint
CREATE INDEX "contact_discovery_jobs_status_idx" ON "contact_discovery_jobs" USING btree ("status","created_at");