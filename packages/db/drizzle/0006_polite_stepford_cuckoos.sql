ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "weight_kg" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_stats_in_comments" boolean DEFAULT true NOT NULL;
