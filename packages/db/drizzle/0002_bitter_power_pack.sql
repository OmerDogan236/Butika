CREATE TABLE "boutique_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"boutique_id" uuid
);
--> statement-breakpoint
ALTER TABLE "boutique_suggestions" ADD CONSTRAINT "boutique_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boutique_suggestions" ADD CONSTRAINT "boutique_suggestions_boutique_id_boutiques_id_fk" FOREIGN KEY ("boutique_id") REFERENCES "public"."boutiques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boutique_suggestions_status_created_idx" ON "boutique_suggestions" USING btree ("status","created_at" DESC NULLS LAST);