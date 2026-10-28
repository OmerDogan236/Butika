CREATE TABLE "boutique_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boutique_name" text NOT NULL,
	"city" text NOT NULL,
	"contact_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"website" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "boutique_applications_created_idx" ON "boutique_applications" USING btree ("created_at" DESC NULLS LAST);